/*
 * engine.js — Authentification & comptes marchands (logique partagée).
 *
 * signup / login / me, avec mots de passe hachés (scrypt) et JWT (HS256).
 * Persistance via db.js (PostgreSQL/Supabase en prod, mémoire en démo).
 *
 * Chaque compte = un marchand (org). Le JWT porte { sub: userId, email }.
 */

const auth = require("./crypto-auth");
const db = require("./db");

function jwtSecret() {
  return process.env.AUTH_JWT_SECRET || "dev-insecure-secret-change-me";
}

function publicUser(u) {
  return { id: u.id, email: u.email, brand_name: u.brand_name || "", created_at: u.created_at };
}

function validEmail(e) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ""));
}

async function signup(body) {
  body = body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!validEmail(email)) return { status: 400, body: { error: "invalid email" } };
  if (password.length < 8) return { status: 400, body: { error: "password must be at least 8 characters" } };

  const existing = await db.selectOne("users", { email: email });
  if (existing) return { status: 409, body: { error: "an account already exists with this email" } };

  const user = await db.insert("users", {
    email: email,
    password_hash: auth.hashPassword(password),
    brand_name: String(body.brand_name || "").trim(),
  });

  const token = auth.signJWT({ sub: user.id, email: user.email }, jwtSecret());
  return { status: 201, body: { token: token, user: publicUser(user) } };
}

async function login(body) {
  body = body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = await db.selectOne("users", { email: email });
  // Message générique (ne révèle pas si l'email existe).
  if (!user || !auth.verifyPassword(password, user.password_hash)) {
    return { status: 401, body: { error: "invalid email or password" } };
  }
  const token = auth.signJWT({ sub: user.id, email: user.email }, jwtSecret());
  return { status: 200, body: { token: token, user: publicUser(user) } };
}

async function me(authHeader) {
  const token = String(authHeader || "").replace(/^Bearer\s+/i, "").trim();
  const payload = auth.verifyJWT(token, jwtSecret());
  if (!payload) return { status: 401, body: { error: "invalid or expired token" } };
  const user = await db.selectOne("users", { id: payload.sub });
  if (!user) return { status: 401, body: { error: "user not found" } };
  return { status: 200, body: { user: publicUser(user) } };
}

function health() {
  return {
    ok: true,
    auth: "ready",
    storage: db.isConfigured() ? "postgres" : "in-memory (demo)",
    jwt_secret_set: !!process.env.AUTH_JWT_SECRET,
  };
}

// Vérifie un token et renvoie le payload (utilitaire pour d'autres modules).
function verifyToken(authHeader) {
  const token = String(authHeader || "").replace(/^Bearer\s+/i, "").trim();
  return auth.verifyJWT(token, jwtSecret());
}

module.exports = { signup, login, me, health, verifyToken };

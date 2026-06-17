const path = require("path");
const { defineConfig } = require("drizzle-kit");

module.exports = defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});

if (process.env.STAGING_D1_OK === "1") process.exit(0);

console.error(
  "Refusing npm run deploy:staging: the default Worker shares the production D1 database.",
);
console.error(
  "Provision a separate staging D1, point default [[d1_databases]] at it, then set STAGING_D1_OK=1.",
);
console.error("Use npm run deploy for production (--env production).");
process.exit(1);

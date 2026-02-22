#!/usr/bin/env node
import { buildSite } from './site-lib.mjs';

buildSite()
  .then((result) => {
    console.log(`build-site: OK (${result.postCount} posts)`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

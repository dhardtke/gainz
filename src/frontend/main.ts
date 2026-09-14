/**
 * Entry point. Everything below is TypeScript, plain ES modules and custom
 * elements — no bundler and no build output; the server erases the types on
 * the way out and the browser loads one module per file.
 */
import './app/gz-app.ts';

// Land on the dashboard so the address bar always shows a real route.
if (!location.hash) {
  location.replace('#/');
}

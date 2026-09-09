/**
 * Entry point. Everything below is plain ES modules and custom elements —
 * no build step, no dependencies; the browser loads exactly what it sees.
 */
import "../components/gz-app/gz-app.js";

// Land on the dashboard so the address bar always shows a real route.
if (!location.hash) {
  location.replace("#/");
}

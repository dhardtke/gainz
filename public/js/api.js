/** Thin client for the gainz REST API. No dependencies, just fetch. */

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError("Could not reach the gainz server", 0, cause);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(data?.error ?? `Request failed (${response.status})`, response.status, data?.details);
  }
  return data;
}

const get = (path) => request("GET", path);
const post = (path, body) => request("POST", path, body ?? {});
const patch = (path, body) => request("PATCH", path, body ?? {});
const remove = (path) => request("DELETE", path);

export const api = {
  summary: () => get("/stats/summary"),

  exercises: {
    list: () => get("/exercises"),
    get: (id) => get(`/exercises/${id}`),
    progress: (id) => get(`/exercises/${id}/progress`),
    create: (input) => post("/exercises", input),
    update: (id, patchBody) => patch(`/exercises/${id}`, patchBody),
    remove: (id) => remove(`/exercises/${id}`),
  },

  workouts: {
    list: ({ limit = 50, offset = 0 } = {}) => get(`/workouts?limit=${limit}&offset=${offset}`),
    get: (id) => get(`/workouts/${id}`),
    create: (input) => post("/workouts", input),
    update: (id, patchBody) => patch(`/workouts/${id}`, patchBody),
    remove: (id) => remove(`/workouts/${id}`),
    addSet: (id, input) => post(`/workouts/${id}/sets`, input),
  },

  sets: {
    update: (id, patchBody) => patch(`/sets/${id}`, patchBody),
    remove: (id) => remove(`/sets/${id}`),
  },
};

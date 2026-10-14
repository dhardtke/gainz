CREATE TABLE weigh_ins (
  measured_on TEXT PRIMARY KEY,
  weight      REAL NOT NULL CHECK (weight > 0)
);

-- A frame from the camera, kept with a punch the employee sent to HR for approval so HR can check who it is.
-- One per kind (IN or OUT); deleted 30 days after HR decides.
CREATE TABLE punch_photos (
  session_id BIGINT NOT NULL,
  kind VARCHAR(3) NOT NULL,
  photo LONGBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, kind),
  CONSTRAINT fk_pp_session FOREIGN KEY (session_id) REFERENCES attendance_sessions(id)
);

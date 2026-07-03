CREATE INDEX "traffic_events_event_type_received_at_idx" ON "traffic_events"("event_type", "received_at");

CREATE INDEX "traffic_events_event_type_track_id_idx" ON "traffic_events"("event_type", "track_id");

CREATE INDEX "traffic_events_event_type_vehicle_track_id_idx" ON "traffic_events"("event_type", "vehicle_track_id");

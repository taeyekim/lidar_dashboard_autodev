-- CreateTable
CREATE TABLE "control_commands" (
    "id" TEXT NOT NULL,
    "command_code" TEXT NOT NULL,
    "command_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "transport" TEXT NOT NULL DEFAULT 'TCP',
    "target_device_id" TEXT,
    "traffic_event_id" TEXT,
    "mode" TEXT,
    "status_code" TEXT,
    "select_code" TEXT,
    "packet_hex" TEXT NOT NULL,
    "response_hex" TEXT,
    "crc_status" TEXT,
    "error_message" TEXT,
    "requested_by_user_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_command_logs" (
    "id" TEXT NOT NULL,
    "control_command_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_command_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_status_logs" (
    "id" TEXT NOT NULL,
    "device_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CONTROL_BOARD',
    "status" TEXT NOT NULL,
    "health" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "control_commands_command_code_key" ON "control_commands"("command_code");

-- CreateIndex
CREATE INDEX "control_commands_status_idx" ON "control_commands"("status");

-- CreateIndex
CREATE INDEX "control_commands_command_type_idx" ON "control_commands"("command_type");

-- CreateIndex
CREATE INDEX "control_commands_traffic_event_id_idx" ON "control_commands"("traffic_event_id");

-- CreateIndex
CREATE INDEX "control_commands_target_device_id_idx" ON "control_commands"("target_device_id");

-- CreateIndex
CREATE INDEX "control_commands_requested_at_idx" ON "control_commands"("requested_at");

-- CreateIndex
CREATE INDEX "control_command_logs_control_command_id_idx" ON "control_command_logs"("control_command_id");

-- CreateIndex
CREATE INDEX "control_command_logs_action_idx" ON "control_command_logs"("action");

-- CreateIndex
CREATE INDEX "control_command_logs_created_at_idx" ON "control_command_logs"("created_at");

-- CreateIndex
CREATE INDEX "device_status_logs_device_id_idx" ON "device_status_logs"("device_id");

-- CreateIndex
CREATE INDEX "device_status_logs_source_idx" ON "device_status_logs"("source");

-- CreateIndex
CREATE INDEX "device_status_logs_status_idx" ON "device_status_logs"("status");

-- CreateIndex
CREATE INDEX "device_status_logs_created_at_idx" ON "device_status_logs"("created_at");

-- AddForeignKey
ALTER TABLE "control_commands" ADD CONSTRAINT "control_commands_target_device_id_fkey" FOREIGN KEY ("target_device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_commands" ADD CONSTRAINT "control_commands_traffic_event_id_fkey" FOREIGN KEY ("traffic_event_id") REFERENCES "traffic_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_commands" ADD CONSTRAINT "control_commands_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_command_logs" ADD CONSTRAINT "control_command_logs_control_command_id_fkey" FOREIGN KEY ("control_command_id") REFERENCES "control_commands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_status_logs" ADD CONSTRAINT "device_status_logs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

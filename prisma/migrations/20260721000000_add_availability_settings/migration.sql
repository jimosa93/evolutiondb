CREATE TABLE "availability_settings" (
    "key" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "availability_settings_pkey" PRIMARY KEY ("key")
);

INSERT INTO "availability_settings" ("key", "available", "updated_at")
VALUES ('global', true, CURRENT_TIMESTAMP);

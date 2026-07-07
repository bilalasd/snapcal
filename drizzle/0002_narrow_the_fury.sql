CREATE TABLE "health_tokens" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone,
	"needs_reconnect" boolean DEFAULT false NOT NULL
);

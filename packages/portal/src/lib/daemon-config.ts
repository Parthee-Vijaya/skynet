/**
 * Daemon connection settings.
 * Portal talks to the Skynet daemon via these endpoints.
 */

export const DAEMON_HOST = process.env.SKYNET_DAEMON_HOST ?? "localhost";
export const DAEMON_PORT = parseInt(process.env.SKYNET_DAEMON_PORT ?? "6767", 10);
export const DAEMON_BASE_URL = `http://${DAEMON_HOST}:${DAEMON_PORT}`;
export const DAEMON_WS_URL = `ws://${DAEMON_HOST}:${DAEMON_PORT}`;

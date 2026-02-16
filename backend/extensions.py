"""Shared Flask extensions (e.g. SocketIO) so controllers can emit without circular imports."""
import os
from flask_socketio import SocketIO

# Use threading on Vercel (serverless); eventlet elsewhere for WebSockets
async_mode = "threading" if os.environ.get("VERCEL") else "eventlet"
socketio = SocketIO(cors_allowed_origins="*", async_mode=async_mode)

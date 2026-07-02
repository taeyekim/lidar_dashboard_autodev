let broadcaster = () => {};

function setRealtimeBroadcaster(fn) {
  broadcaster = typeof fn === "function" ? fn : () => {};
}

function broadcastRealtime(type, payload) {
  broadcaster(type, payload);
}

module.exports = {
  setRealtimeBroadcaster,
  broadcastRealtime,
};

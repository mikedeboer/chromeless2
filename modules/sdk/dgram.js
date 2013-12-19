/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
"use strict";

const {Cc, Ci, CC, Cr} = require("chrome");

const {OutputStream} = require("sdk/io/stream");
const {emit, on, once} = require("sdk/event/core");
const {EventTarget} = require("sdk/event/target");
const {Buffer} = require("sdk/io/buffer");
const {Class} = require("sdk/core/heritage");
const util = require("util");

const UDPSocket = CC("@mozilla.org/network/udp-socket;1", "nsIUDPSocket");

const dnsService = Cc["@mozilla.org/network/dns-service;1"]
                     .createInstance(Ci.nsIDNSService);

const BIND_STATE_UNBOUND = 0;
const BIND_STATE_BINDING = 1;
const BIND_STATE_BOUND = 2;
const {FAMILY_INET, FAMILY_INET6, FAMILY_LOCAL} = Ci.nsINetAddr;

const SocketObserver = Class({
  initialize: function(socket) {
    this.socket = socket;
  },
  onPacketReceived: function(handle, message) {
    let rinfo = {
      type: message.fromAddr.family == FAMILY_INET6 ? "udp6" : "udp4",
      host: message.fromAddr.address,
      port: message.fromAddr.port,
      _stream: OutputStream({asyncOutputStream: message.outputStream})
    };

    let buf = message.data;
    if (!util.isBuffer(buf))
      buf = new Buffer(buf);

    emit(this.socket, "message", buf, rinfo);
  },
  onStopListening: function(handle, reason) {
    // `reason` is NS_BINDING_ABORTED if the socket was closed manually.
    if (reason !== Cr.NS_BINDING_ABORTED)
      emit(this.socket, "error", reason);
    emit(this.socket, "close");
  }
});

const healthCheck = function(socket) {
  if (!socket._handle)
    throw new Error("Not running");
};

const startListening = function(socket) {
  try {
    socket._handle.asyncListen(SocketObserver(socket));
  } catch (ex) {}
  socket._receiving = true;
  socket._bindState = BIND_STATE_BOUND;

  emit(socket, "listening");
}

const kLoopbackDevices = new Set(["127.0.0.1", "localhost", "::1"]);
const kMaxPortNo = 65535;

const Socket = Class({
  extends: EventTarget,
  initialize: function(type, listener) {
    this._handle = new UDPSocket();
    this._receiving = false;
    this._bindState = BIND_STATE_UNBOUND;
    // Store address host separately, because it's not accessible from script.
    this._host = null;
    this.type = type;

    if (util.isFunction(listener))
      on(this, "message", listener);
  },
  fd: null,
  type: null,
  send: function(buffer, offset, length, port, address, callback) {
    if (!util.isBuffer(buffer))
      throw new TypeError("First argument must be a buffer object.");

    offset = offset | 0;
    if (offset < 0)
      throw new RangeError("Offset should be >= 0");

    if (offset >= buffer.length)
      throw new RangeError("Offset into buffer too large");

    // Sending a zero-length datagram is kind of pointless but it _is_
    // allowed, hence check that length >= 0 rather than > 0.
    length = length | 0;
    if (length < 0)
      throw new RangeError("Length should be >= 0");

    if (offset + length > buffer.length)
      throw new RangeError("Offset + length beyond buffer length");

    port = port | 0;
    if (port <= 0 || port > kMaxPortNo)
      throw new RangeError("Port should be > 0 and < 65536");

    // Normalize callback so it's either a function or undefined but not anything
    // else.
    if (!util.isFunction(callback))
      callback = undefined;

    healthCheck(this);

    if (this._bindState == BIND_STATE_UNBOUND)
      this.bind(0, null);

    // If the socket hasn't been bound yet, push the outbound packet onto the
    // send queue and send after binding is complete.
    if (this._bindState != BIND_STATE_BOUND) {
      // If the send queue hasn't been initialized yet, do it, and install an
      // event handler that flushes the send queue after binding is done.
      if (!this._sendQueue) {
        this._sendQueue = [];
        this.once("listening", () => {
          // Flush the send queue.
          for (let queueItem of this._sendQueue)
            this.send.apply(this, queueItem);
          this._sendQueue = undefined;
        });
      }
      this._sendQueue.push([buffer, offset, length, port, address, callback]);
      return;
    }

    if (!address)
      address = this._host || this.type == "udp6" ? "::0" : "0.0.0.0";
    if (kLoopbackDevices.has(address))
      address = "127.0.0.1";
    if (!util.isBuffer(buffer)) {
      buffer = new Buffer(buffer);
      length = buffer.length;
    }

    buffer = buffer.slice(offset, length);
    this._handle.send(address, port, buffer, buffer.byteLength);
    if (callback)
      callback();
  },
  sendto: function(buffer, offset, length, port, address, callback) {
    if (!util.isNumber(offset) || !util.isNumber(length))
      throw new Error("send takes offset and length as args 2 and 3");

    if (!util.isString(address))
      throw new Error(this.type + " sockets must send to port, address");

    this.send(buffer, offset, length, port, address, callback);
  },
  bind: function(/*port, address, callback*/) {
    healthCheck(this);

    if (this._bindState != BIND_STATE_UNBOUND)
      throw new Error("Socket is already bound");

    this._bindState = BIND_STATE_BINDING;

    if (util.isFunction(arguments[arguments.length - 1]))
      once(this, "listening", arguments[arguments.length - 1]);

    if (arguments[0].QueryInterface && arguments[0].QueryInterface(Ci.nsIUDPSocket)) {
      // Replace the existing handle by the handle we got from master.
      this._handle.close();
      this._handle = arguments[0];
      startListening(this);
      return;
    }

    let port = arguments[0];
    let address = arguments[1];
    if (util.isFunction(address))
      address = "";  // a.k.a. "any address"
    this._handle.init(port, kLoopbackDevices.has(address));

    startListening(this);
  },
  close: function() {
    healthCheck(this);
    this._handle.close();
    this._handle = null;
  },
  address: function() {
    healthCheck(this);

    return {
      host: this._host || dnsService.myHostName,
      family: this.type,
      port: this._handle.port,
    };
  },
  setBroadcast: function(flag) console.warn("socket.setBroadcast() is not supported"),
  setTTL: function(ttl) console.warn("socket.setTTL() is not supported"),
  setMulticastTTL: function(ttl) console.warn("socket.setMulticastTTL() is not supported"),
  setMulticastLoopback: function(flag) console.warn("socket.setMulticastLoopback() is not supported"),
  addMembership: function(multicastAddress, multicastInterface) console.warn("socket.addMembership() is not supported"),
  dropMembership: function(multicastAddress, multicastInterface) console.warn("socket.dropMembership() is not supported"),
  unref: function() console.warn("socket.unref() is not supported"),
  ref: function() console.warn("socket.ref() is not supported")
});
exports.Socket = Socket;

exports.createSocket = function createSocket(type, listener) {
  return Socket(type, listener);
};

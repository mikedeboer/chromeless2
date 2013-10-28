var Stream = require("stream");
var Fiber = require("fibers");
var Bunzip = require("seek-bzip")

/** Use node-fibers to convert our synchronous Stream interface to the
  * standard node asynchronous interface. */
var BunzipStream = module.exports = function() {
  if (!(this instanceof BunzipStream))
    return new BunzipStream();

  var trans = this;
  Stream.Transform.call(trans); // initialize superclass.
  this._fiber = new Fiber(function() {
    var buffer = [], pos = 0;
    var inputStream = new Bunzip.Stream();
    inputStream.readByte = function() {
      if (pos >= buffer.length) {
        buffer = Fiber.yield();
        pos = 0;
      }
      return buffer[pos++];
    };
    var outputStream = new Bunzip.Stream();
    outputStream.writeByte = function(_byte) {
      this.write(new Buffer([_byte]),0,1);
    };
    outputStream.write = function(buffer, bufOffset, length) {
      if (bufOffset !== 0 || length !== buffer.length) {
        buffer = buffer.slice(bufOffset, bufOffset + length);
      }
      trans.push(buffer);
    };
    Bunzip.decode(inputStream, outputStream);
  });
  this._fiber.run();
};

require("util").inherits(BunzipStream, Stream.Transform);

BunzipStream.prototype._transform = function(chunk, encoding, callback) {
    this._fiber.run(chunk);
    callback();
};

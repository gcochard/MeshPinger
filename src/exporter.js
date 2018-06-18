/**
 * @fileoverview Description of this file.
 */

const fs = require('fs');
const Spanner = require('@google-cloud/spanner');
const spanner = new Spanner();
const hostname = require('os').hostname();

const instanceId = 'mesh-pinger';
const databaseId = 'pinger-log';

const instance = spanner.instance(instanceId);
const database = instance.database(databaseId);
const logTable = database.table('log');

const buf = Buffer.alloc(1024);
let offset = 0;
let last = '';

const pending = [];

// bit-reverse for the src_timestamp, taken from
// https://codegolf.stackexchange.com/a/105633/8028
const reverse = n=>+[...n.toString(2),'0b'].reverse().join``;

function leftPad(str, pad, len){
  while(str.length < len){
    str = pad + str;
  }
  return str;
}

function commitChanges(){
  while(pending.length){
    let row = pending.shift();
    row.rev_timestamp = leftPad(reverse(row.src_timestamp), '0', 13);
    return log.insert(row);
    log.insert()
  }
}


function mount(filename){
  const fh = fs.openSync(filename, 'r');
  const watcher = fs.watch(filename);
  watcher.on('change', function read(details){
    fs.read(fh, buf, 0, buf.length, function(err, bytesRead, buffer){
      const str = last + buf.toString(0, bytesRead);
      last = '';
      const arr = str.split('\n');
      // the last array entry should be blank because each line is \n terminated
      if(!arr[arr.length-1]){
        // discard blank lines
        let throwAway = arr.pop();
      } else {
        // cache the last, incomplete, line
        last = arr[arr.length-1];
      }

      arr = arr.map(entry => JSON.parse(entry));

      // push all the new lines onto the pending array
      Array.prototype.push.apply(pending, arr);

      // if the buffer filled, start again
      if(bytesRead == buf.length){
        process.nextTick(read);
      }
      commitChanges();
    });
  });
}

module.exports = {mount};

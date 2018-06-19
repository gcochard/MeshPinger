/**
 * @fileoverview Description of this file.
 */

const hostname = require('os').hostname();
const fs = require('fs');
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

function lazyInit(){
  const Spanner = require('@google-cloud/spanner');
  const spanner = new Spanner();

  const instanceId = 'mesh-pinger';
  const databaseId = 'pinger-log';

  const instance = spanner.instance(instanceId);
  const database = instance.database(databaseId);
  const logTable = database.table('log');

  return function(){
    return logTable;
  };
}

let pendingSync;
function insertRow(row){
  pending.push(row);
  pendingSync = pendingSync || setTimeout(commitChanges, 100);
}

function commitChanges(){
  clearTimeout(pendingSync);
  pendingSync = null;
  getTable = lazyInit();
  while(pending.length){
    let row = pending.shift();
    row.rev_timestamp = leftPad(reverse(new Date(row.src_timestamp).getTime()), '0', 13);
    getTable().insert(row, function(err, apiResponse){
      if(err){
        console.error(err);
        console.log(`error on inserted row: ${JSON.stringify(row)}`);
        // put it back onto the head of the queue and wait until next time
        // if it is a recoverable error, otherwise drop it
        if([5, 6, 9].indexOf(err.code) === -1){
          pending.unshift(row);
          // queue another push in 100ms
          if(pendingSync){
            clearTimeout(pendingSync);
          }
          setTimeout(commitChanges, 100);
        }
      } else {
        console.log(`api response: ${JSON.stringify(apiResponse)}`);
      }
    });
  }
}

let mountedFilename;
function process(filename){
  mountedFilename = filename;
  console.log('mounting exporter...');
  let rs;
  if(!fs.existsSync(filename)){
    return setTimeout(() => process(filename), 100);
  }
  rs = fs.createReadStream(filename);
  rs.on('data', function read(buf){
    console.log(`change read: ${buf.toString()}`);
    const str = last + buf.toString();
    last = '';
    let arr = str.split('\n');
    // the last array entry should be blank because each line is \n terminated
    if(!arr[arr.length-1]){
      // discard blank lines
      let throwAway = arr.pop();
    } else {
      // cache the last, incomplete, line
      last = arr[arr.length-1];
      arr.pop();
    }

    arr = arr.map(entry => {
      let parsedEntry;
      try {
        parsedEntry = JSON.parse(entry);
        console.log(entry);
      } catch(e){
        console.error(e);
        console.log(entry);
      }
      return parsedEntry;
    }).filter(entry => !!entry);

    // push all the new lines onto the pending array
    Array.prototype.push.apply(pending, arr);

    commitChanges();
  });
}

module.exports = {process, commitChanges, insertRow};

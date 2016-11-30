/**
 * Copyright 2016 PhenixP2P Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const _ = require('lodash');
const yargs = require('yargs');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');
const moment = require('moment');

function createLogsCallback(output) {
    const outputStream = fs.createWriteStream(output);

    return function () {
        outputStream.write(moment.utc().toISOString());
        outputStream.write('\t');
        for (var i = 0; i < arguments.length; i++) {
            outputStream.write('' + arguments[i]);
            outputStream.write('\t');
        }
        outputStream.write('\n');
    };
}

function runUdpServerSocket(port, callback) {
    const server = dgram.createSocket('udp4');
    const incoming = {};

    server.on('error', function (err) {
        console.log('Server error:\n%s', err.stack);
        server.close();
    });

    server.on('message', function (msg, rinfo) {
        const cols = msg.toString().split('\t');
        const time = moment.utc(cols[0]);
        const hostname = cols[1];
        const count = parseInt(cols[2]);

        if (!_.has(incoming, hostname)) {
            incoming[hostname] = {
                last: time,
                count: count
            };
            callback('first', hostname, time.toISOString(), count);
        } else {
            if (count < incoming[hostname].count - 1000) {
                callback('reset', hostname, time.toISOString(), count);
                incoming[hostname] = {
                    last: time,
                    count: count
                };
            } else if (count < incoming[hostname].count) {
                callback('out-of-order', hostname, time.toISOString(), count);
            } else if (count === incoming[hostname].count) {
                callback('duplicate', hostname, time.toISOString(), count);
            } else if (count === incoming[hostname].count + 1) {
                const delta = time.diff(incoming[hostname].last, 'milliseconds');

                if (delta > 2000) {
                    callback('delayed', hostname, time.toISOString(), count, delta, incoming[hostname].last.toISOString());
                }

                incoming[hostname] = {
                    last: time,
                    count: count
                };
            } else {
                const missing = count - incoming[hostname].count - 1;

                callback('missing', hostname, time.toISOString(), count, missing, incoming[hostname].last.toISOString());

                incoming[hostname] = {
                    last: time,
                    count: count
                };
            }
        }
    });

    server.on('listening', function () {
        const address = server.address();
        console.log('Server listening %s:%d', address.address, address.port);

        callback('listening', address.address, address.port);
    });

    server.bind(port);
}

function runPinger(endpoint, interval, callback) {
    console.log('Run pinger to end point %s with interval of %d ms', endpoint, interval);

    const address = _.get(endpoint.split(':'), '[0]', 'localhost');
    const port = parseInt(_.get(endpoint.split(':'), '[1]', 25000));
    const client = dgram.createSocket('udp4');
    const hostname = os.hostname();
    var count = 0;

    setInterval(function () {
        const msg = moment.utc().toISOString() + '\t' + hostname + '\t' + count++;

        client.send(msg, 0, msg.length, port, address, function (err) {
            if (err) {
                callback('send-failed', endpoint);
            }
        });
    }, interval);
}

yargs
    .usage('$0 <cmd> [args]')
    .command('mesh-ping [port] [endpoints] [logs]', 'Ping end points', {
        endpoints: {
            default: 'endpoints.list'
        },
        interval: {
            default: 500
        },
        port: {
            default: 25000
        },
        logs: {
            default: 'pinger.logs'
        }
    }, function (argv) {
        const logsCallback = createLogsCallback(argv.logs);
        const endpoints = _.filter(fs.readFileSync(argv.endpoints).toString().split(/[\r\n]/), function (val) { return _.trim(val); });

        runUdpServerSocket(argv.port, logsCallback);

        endpoints.forEach(function (endpoint) {
            runPinger(endpoint, argv.interval, logsCallback);
        });
    }).help().argv;

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
const localHostname = os.hostname();

function createLogsCallback(output) {
    const outputStream = fs.createWriteStream(output, {flags: 'a'});

    return function () {
        for (var i = 0; i < arguments.length; i++) {
            outputStream.write('' + arguments[i]);
            outputStream.write('\t');
        }
        outputStream.write('\n');
    };
}

function runUdpServerSocket(port, epoch, callback) {
    const client = dgram.createSocket('udp4');
    const server = dgram.createSocket('udp4');
    const alpha = 1 / epoch;
    const beta = 1. - alpha;
    const incoming = {};

    server.on('error', function (err) {
        console.log('Server error:\n%s', err.stack);
        server.close();
    });

    function handlePing(now, hostname, time, count) {
        const latency = now.diff(time, 'milliseconds');

        function createRecord() {
            incoming[hostname] = {
                lastTime: time,
                count: count,
                latencyEma: latency,
                latencyEmaVar: 0.,
                latencyMin: latency,
                latencyMax: latency
            };
        }

        if (!_.has(incoming, hostname)) {
            createRecord();
            callback(now.toISOString(), 'first', hostname, time.toISOString(), count, epoch);
        } else {
            const record = incoming[hostname];

            function update() {
                record.lastTime = time;
                record.count = count;
                // http://stats.stackexchange.com/questions/111851/standard-deviation-of-an-exponentially-weighted-mean
                record.latencyEmaVar = beta * (record.latencyEmaVar + alpha * Math.pow(latency - record.latencyEma, 2));
                record.latencyEma = beta * record.latencyEma + alpha * latency;
                record.latencyMin = Math.min(latency, record.latencyMin);
                record.latencyMax = Math.max(latency, record.latencyMax);
            }

            if (record.count > 2 * epoch && count < epoch) {
                createRecord();
                callback(now.toISOString(), 'reset', hostname, time.toISOString(), count, epoch);
            } else if (count < record.count) {
                callback(now.toISOString(), 'out-of-order', hostname, time.toISOString(), count);
            } else if (count === record.count) {
                callback(now.toISOString(), 'duplicate', hostname, time.toISOString(), count);
            } else if (count === record.count + 1) {
                if (latency > 2000) {
                    callback(now.toISOString(), 'delayed', hostname, time.toISOString(), count, latency, record.lastTime.toISOString());
                }

                update();
            } else {
                const missing = count - record.count - 1;

                callback(now.toISOString(), 'missing', hostname, time.toISOString(), count, missing, record.lastTime.toISOString());

                update();
            }

            if (count % epoch === 0) {
                callback(now.toISOString(), 'latency', hostname, time.toISOString(), count,
                    record.latencyEma, record.latencyEmaVar, Math.sqrt(record.latencyEmaVar), record.latencyMin, record.latencyMax,
                    record.rttEma, record.rttEmaVar, Math.sqrt(record.rttEmaVar), record.rttMin, record.rttMax);
                record.latencyMin = Number.MAX_SAFE_INTEGER;
                record.latencyMax = Number.MIN_SAFE_INTEGER;
                record.rttMin = Number.MAX_SAFE_INTEGER;
                record.rttMax = Number.MIN_SAFE_INTEGER;
            }
        }
    }

    function handlePong(now, hostname, time, count) {
        const rtt = now.diff(time, 'milliseconds');

        if (!incoming[hostname]) {
            return;
        }
        const record = incoming[hostname];

        if (!record.rttEma) {
            record.rttEma = rtt;
            record.rttEmaVar = 0.;
            record.rttMin = Number.MAX_SAFE_INTEGER;
            record.rttMax = Number.MIN_SAFE_INTEGER;
        }

        // http://stats.stackexchange.com/questions/111851/standard-deviation-of-an-exponentially-weighted-mean
        record.rttEmaVar = beta * (record.rttEmaVar + alpha * Math.pow(rtt - record.rttEma, 2));
        record.rttEma = beta * record.rttEma + alpha * rtt;
        record.rttMin = Math.min(rtt, record.rttMin);
        record.rttMax = Math.max(rtt, record.rttMax);
    }

    server.on('message', function (msg, rinfo) {
        const cols = msg.toString().split('\t');

        if (cols[0] === 'ping') {
            const pong = 'pong\t' + cols[1] + '\t' + localHostname + '\t' + cols[3];

            client.send(pong, 0, pong.length, port, rinfo.address, function (err) {
                if (err) {
                    callback(moment.utc().toISOString(), 'send-failed', cols[2], 'pong', cols[1], cols[3]);
                }
            });
        }

        const now = moment.utc();
        const type = cols[0];
        const time = moment.utc(cols[1]);
        const hostname = cols[2];
        const count = parseInt(cols[3]);

        switch (type) {
            case 'ping':
                handlePing(now, hostname, time, count);
                break;
            case 'pong':
                handlePong(now, hostname, time, count);
                break;
        }
    });

    server.on('listening', function () {
        const now = moment.utc();
        const address = server.address();
        console.log('Server listening %s:%d', address.address, address.port);

        callback(now.toISOString(), 'listening', address.address, address.port);
    });

    server.bind(port);
}

function runPinger(endpoint, interval, callback) {
    console.log('Run pinger to end point %s with interval of %d ms', endpoint, interval);

    const address = _.get(endpoint.split(':'), '[0]', 'localhost');
    const port = parseInt(_.get(endpoint.split(':'), '[1]', 25000));
    const client = dgram.createSocket('udp4');
    var count = 0;

    setInterval(function () {
        const pingTimestamp = moment.utc().toISOString();
        const pingCount = count++;
        const ping = 'ping\t' + pingTimestamp + '\t' + localHostname + '\t' + pingCount;

        client.send(ping, 0, ping.length, port, address, function (err) {
            if (err) {
                callback(pingTimestamp, 'send-failed', endpoint, 'ping', pingTimestamp, pingCount);
            }
        });
    }, interval);
}

yargs
    .usage('$0 <cmd> [args]')
    .command('mesh-ping [port] [endpoints] [log]', 'Ping end points', {
        endpoints: {
            default: 'endpoints.list'
        },
        interval: {
            default: 500
        },
        epoch: {
            default: 120
        },
        port: {
            default: 25000
        },
        log: {
            default: 'pinger.log'
        }
    }, function (argv) {
        const logCallback = createLogsCallback(argv.log);
        const endpoints = _.filter(fs.readFileSync(argv.endpoints).toString().split(/[\r\n]/), function (val) { return _.trim(val); });

        runUdpServerSocket(argv.port, argv.epoch, logCallback);

        endpoints.forEach(function (endpoint) {
            runPinger(endpoint, argv.interval, logCallback);
        });
    }).help().argv;

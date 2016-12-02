# Mesh Pinger
A simple mesh pinger to detect networking issues.

# Running the Pinger
The pinger takes as input a list of hostnames identifying the endpoints that UDP packets are sent to.

The output is a log file that contains various events that make it easy to process with scripts for post-mortem analysis.

# Log Format

## Log Events
There is a number of events that are logged.

* **first** Whenever a new incoming ping origin is added then this message is logged. Columns: event-name, hostname, ping-time, ping-count
* **delayed** This event is logged if the estimated one-way latency (based on NTP synchronized host times) is more than 2 seconds. Columns: event-name, hostname, ping-time, ping-count, estimated-one-way-latency, previous-ping-time);
* **missing** This event is logged if a gap of packets was detected. Columns: event-name, hostname, ping-time, ping-count, number-of-missing-packets, previous-ping-time
* **out-of-order** This event is logged if a packet is received out of order. Columns: event-name, hostname, ping-time, ping-count
* **duplicate** This event is logged if a duplicate packet is received: Columns: event-name, hostname, ping-time, ping-count
* **latency** This event logs the [weighted moving mean, weighted moving variance and weighted moving standard deviation](http://stats.stackexchange.com/questions/111851/standard-deviation-of-an-exponentially-weighted-mean) of the one-way latency estimation. Colunns: event-name, hostname, ping-time, ping-count, weighted-mean, weighted-variance, weighted-standard-deviation
* **send-failed** This event is logged if sending of a packet failed. This can happen, for example, when the DNS resolution of the hostname fails. Columns: event-name, destination-hostname, ping-time, ping-count


## Analyzing data
All collected data is for incoming packets except for the **send-failed** event. In order to analyze a connection the logs of both sides need to be analyzed and correlated. The benefit of this approach is that asymetric networking issues can easily be identified.

### Lost packets
An important caveat to keep in mind when analyzing the data is that **missing** are not equal **lost** packets. A missing packet followed by and out-of-order event for the same packet, for example, is one situation where the missing packet is not actually lost. It was just missing in the sequence and then received as an out-of-order packet.

### Latency
Please make sure that **NTP** time synchronization is properly setup on each node as otherwise the latency estimation will be off and somewhat useless.
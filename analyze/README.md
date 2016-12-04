# R Script for data analysis
There is a few R script to analyze the data produced by the mesh pinger nodes.

In general, they expect a `data.csv` file corresponding to the combined event logs with one extra column in front indicate the node that the data row is from.

They also expect a node list file `nodes.list` that contains the name of the nodes found int column 1 and 4 of `data.csv`.

## fit-latency.r
For better one-way latency estimations, [linear least squares](https://en.wikipedia.org/wiki/Linear_least_squares_(mathematics)) may be used to eliminate the local time error solving the questions of round trip time and one-way latency and local time offsets.

## parse-data.r
Parses the round trip time and one-way latency data into a matrix.
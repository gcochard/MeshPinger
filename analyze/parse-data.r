filterData <- function (type, raw) {
    res <- array('', dim=c(nrow(raw),ncol(raw)))
    idx <- 1;

    for (i in 1:nrow(raw)) {
        if (raw[i,3]==type) {
            for (j in 1:ncol(raw)) {
                res[idx,j] <- toString(raw[i,j])
            }
            idx <- idx + 1
        }
    }

    return(res[1:idx-1,])
}

nodes <- as.matrix(read.csv('nodes.list', sep=',', header=FALSE), quote=FALSE)
#print(nodes)

n <- length(nodes)
nodesMap <- new.env(hash=T, parent=emptyenv())
for(i in 1:n) {
  nodesMap[[nodes[i]]] <- i
}
#print(ls(nodesMap))

raw <- filterData('latency', read.csv('data.csv', sep='\t', header=FALSE))
data <- as.matrix(raw, quote=FALSE)
#print(data)

RTT <- matrix(nrow=n, ncol=n)
rownames(RTT) <- nodes[,1]
colnames(RTT) <- nodes[,1]

Latency <- matrix(nrow=n, ncol=n)
rownames(Latency) <- nodes[,1]
colnames(Latency) <- nodes[,1]

for(i in 1:nrow(data)) {
    a <- nodesMap[[data[i,1]]]
    b <- nodesMap[[data[i,4]]]
    Lab <- as.numeric(data[i,10])
    RTTab <- as.numeric(data[i,15])

    if (!is.null(a) && !is.null(b) && !is.null(Lab) && !is.null(RTTab)) {
        Latency[a,b] = Lab
        RTT[a,b] = RTTab
    }
}

print(round(RTT, digits=2))
print(round(Latency, digits=2))

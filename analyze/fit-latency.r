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
Latency <- matrix(nrow=n, ncol=n)
# The first n columns represent to clock error for each node
# The second n times n columns represent the one way latency from node n1 to node n2 (including self ping time)
# The first n rows are used to add up the one-way latency and the clock errors or each of the two nodes
# The second n rows are used to sum up the one-way latency in both direction to equal the round trip time
# The third n rows are used to zero out the sum of one-way latency. This is obviously not a correct assumption but required to let the solver find a solution.
# The fourth n rows are used to minimize the error for the sum of both nodes' clock error to not exceed the difference of the sum of measured one-way latencies and round trip time
X <- matrix(0L, nrow=4*nrow(data), ncol=n+(n*n), byrow=T)
W <- diag(x=1, nrow=4*nrow(data), ncol=4*nrow(data))
y <- array(0L, dim = c(4*nrow(data)))
IdxErr <- 3*nrow(data)+1

for(i in 1:nrow(data)) {
    a <- nodesMap[[data[i,1]]]
    b <- nodesMap[[data[i,4]]]
    Lab <- as.numeric(data[i,10])
    RTTab <- as.numeric(data[i,15])
    IdxL <- (a-1)*n+b
    IdxLRev <- (b-1)*n+a
    LbaDash <- Latency[b,a]
    RTTbaDash <- RTT[b,a]

    if (!is.null(a) && !is.null(b) && !is.null(Lab) && !is.null(RTTab)) {
        Latency[a,b] = Lab
        RTT[a,b] = RTTab

        X[i,a] = ifelse(a==b, 0, -1)
        X[i,b] = ifelse(a==b, 0, 1)
        X[i,n+IdxL] = 1
        y[i] = Lab
        X[nrow(data)+i,n+IdxL] = ifelse(IdxL==IdxLRev, 2, 1)
        X[nrow(data)+i,n+IdxLRev] = ifelse(IdxL==IdxLRev, 2, 1)
        y[nrow(data)+i] = RTTab
        X[2*nrow(data)+i,n+IdxL] = ifelse(IdxL==IdxLRev, 0, 1)
        X[2*nrow(data)+i,n+IdxLRev] = ifelse(IdxL==IdxLRev, 0, 1)
        y[2*nrow(data)+i] = 0

        if (!is.na(LbaDash) && !is.na(RTTbaDash)) {
            if (IdxErr <= nrow(X)) {
                X[IdxErr,a] = 1
                X[IdxErr,b] = 1
                y[IdxErr] = abs(Lab) + abs(LbaDash) - RTTab
                IdxErr = IdxErr + 1
            } else {
                print('WARN: Too much data')
            }
            if (IdxErr <= nrow(X)) {
                X[IdxErr,b] = 1
                X[IdxErr,a] = 1
                y[IdxErr] = abs(LbaDash) + abs(Lab) - RTTbaDash
                IdxErr = IdxErr + 1
            } else {
                print('WARN: Too much data')
            }
        }
    }
}

#print(X)
#print(y)

for (i in 1:nrow(data)) {
    # Clock Error
    W[i,i] = 100
    # One way latency adds up to round trip time
    W[i+nrow(data),i+nrow(data)] = 100
    # Do we want one way latency do zero out? It's an assumption that's not true
    W[i+2*nrow(data),i+2*nrow(data)] = 0.001
    # Minimize clock error estimation
    W[i+3*nrow(data),i+3*nrow(data)] = 1
}

X.T <- t(W %*% X)
#print(X.T)

betaHat <- solve(X.T %*% W %*% X) %*% X.T %*% W %*% y

#print(W)
print(betaHat)

TimeOffset <- matrix(0L, nrow=n, ncol=1, byrow=T)
TimeOffset[,1] = betaHat[1:n,1]
rownames(TimeOffset) <- nodes[,1]
colnames(TimeOffset) <- c('TimeOffset')

print(round(TimeOffset, digits=3))

LatencyHat <- matrix(betaHat[(n+1):(4*n),1], nrow=n, ncol=n, byrow=T)
rownames(LatencyHat) <- nodes[,1]
colnames(LatencyHat) <- nodes[,1]

#print(round(LatencyHat, digits=3))

/**
 * @fileoverview This exposes a healthcheck and data API over http on port 8080
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const util = require('util');
const hostname = require('os').hostname();

const port = 8080;

const healthResponder = (req, res) => {
  res.writeHead(200);
  res.end('OK');
};

module.exports = {
  mount: function(data){
    console.log('mounting server...');
    const dataResponder = (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(util.inspect(data));
    };
    const logResponder = (req, res) => {
      fs.createReadStream('pinger.log').pipe(res);
    };
    const requestHandler = (req, res) => {
      const urlObj = url.parse(req.url);
      res.setHeader('X-Backend-Instance', hostname);
      switch(urlObj.pathname){
        case '/_hc':
          return healthResponder(req, res);
        case '/pinger.log':
          return logResponder(req, res);
        default:
          return dataResponder(req, res);
      }
    }
    const server = http.createServer(requestHandler);
    server.listen(port, err => {
      if(err){
        return console.error('Error starting server', err);
      }
      console.log(`server is listening on port ${port}`);
    });
  }
};

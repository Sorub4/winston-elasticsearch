/*eslint-disable */
var fs = require('fs');
var should = require('should');
var winston = require('winston');
var sinon = require('sinon');

var ElasticTransport = require('../index');
var bulkWriter = require('../bulk_writer');
var defaultTransformer = require('../transformer');

var logMessage = JSON.parse(fs.readFileSync('./test/request_logentry_1.json', 'utf8'));

/*
 * Note: To run the tests, a running elasticsearch instance is required.
 */

// A null logger to prevent ES client spamming the console for deliberately failed tests
function NullLogger(config) {
  this.error = function(msg) { };
  this.warning = function(msg) { };
  this.info = function(msg) { };
  this.debug = function(msg) { };
  this.trace = function(msg) { };
  this.close = function(msg) { };
}

describe('winston-elasticsearch:', function () {
  describe('the default transformer', function () {
    it('should transform log data from winston into a logstash like structure', function (done) {
      var transformed = defaultTransformer({
        message: 'some message',
        level: 'error',
        meta: {
          someField: true
        }
      });
      should.exist(transformed['@timestamp']);
      transformed.severity.should.equal('error');
      transformed.fields.someField.should.be.true();
      done();
    });
  });

  var logger = null;
  var elasticLogger = null;

  describe('a logger', function () {
    it('can be instantiated', function (done) {
      this.timeout(8000);
      try {
        const winstonOptions = {
          transports: [
            new winston.transports.Console({
              level: 'ALL',
              timestamp: () => { return moment().format('LTS'); }
            })]
        }
        elasticClient = new ElasticTransport(NullLogger);
        winstonOptions.transports.push(elasticClient);
        logger = winston.createLogger(winstonOptions);
        done();
      } catch (err) {
        console.log('---->', err);
        should.not.exist(err);
      }
    });

    it('should log to Elasticsearch', function (done) {
      this.timeout(8000);
      var spy = sinon.spy(bulkWriter.prototype, 'append');
      logger.info(logMessage.message, logMessage.meta);
      (spy.calledOnce).should.be.true();

      setTimeout(function () {
        done();
      }, 6500);
    });

    describe('the logged message', function () {
      it('should be found in the bulkWriter', function (done) {
        const results = logger.transports[1].bulkWriter.bulk.filter((obj) => {
          return obj.message === `${logMessage.message}`
        });

        results.length.should.be.above(0);
        done();
      });
    });
  });

  var defectiveLogger = null;

  // describe('a defective log transport', function () {
  //   it('emits an error', function (done) {
  //     this.timeout(40000);
  //     var transport = new (winston.transports.Elasticsearch)({
  //       clientOpts: {
  //         host: 'http://does-not-exist.test:9200',
  //         log: NullLogger,
  //       }
  //     });

  //     transport.on('error', (err) => {
  //       should.exist(err);
  //       done();
  //     });

  //     defectiveLogger = new (winston.Logger)({
  //       transports: [
  //         transport
  //       ]
  //     });
  //   });
  // });

  /* Manual test which allows to test re-connection of the ES client for unavailable ES instance.
  // Must be combined with --no-timeouts option for mocha
  describe('ES Re-Connection Test', function () {
    it('test', function (done) {
      this.timeout(400000);
      setInterval(function() {
        console.log('LOGGING...');
        logger.log(logMessage.level, logMessage.message, logMessage.meta,
          function (err) {
            should.not.exist(err);
          });
        }, 3000);
      });
    });
  */
  });

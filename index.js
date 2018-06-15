'use strict';

const Transport = require('winston-transport');
const moment = require('moment');
const _ = require('lodash');
const elasticsearch = require('elasticsearch');

const defaultTransformer = require('./transformer');
const BulkWriter = require('./bulk_writer');

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
module.exports = class ElasticTransport extends Transport {
  constructor(opts) {
    super(opts);

    //
    // Consume any custom options here. e.g.:
    // - Connection information for databases
    // - Authentication information for APIs (e.g. loggly, papertrail,
    //   logentries, etc.).
    //

    this.options = opts || {};
    if (!opts.timestamp) {
      this.options.timestamp = function timestamp() {
        return new Date().toISOString();
      };
    }

    // Enforce context
    if (!(this instanceof ElasticTransport)) {
      return new ElasticTransport(this.options);
    }

    // Bind to instance of ElasticTransport for use of this
    // - Mocha discourages arrow functions and will throw if we attempt to use
    // - See https://github.com/airbnb/javascript/issues/1379
    this.initELasticClient = this.initELasticClient.bind(this);
    this.initBulkWriter = this.initBulkWriter.bind(this);

    // Initialize Client and Bulk Writer
    this.initELasticClient();
    this.initBulkWriter();
  }

  // initialize elastic client with options
  initELasticClient() {
    // Set defaults
    const defaults = {
      level: 'info',
      index: null,
      indexPrefix: 'logs',
      indexSuffixPattern: 'YYYY.MM.DD',
      messageType: 'log',
      transformer: defaultTransformer,
      ensureMappingTemplate: true,
      flushInterval: 2000,
      waitForActiveShards: 1,
      handleExceptions: false,
      pipeline: null
    };
    _.defaults(this.options, defaults);

    // Use given client or create one
    if (this.options.client) {
      this.client = this.options.client;
    } else {
      const defaultClientOpts = {
        clientOpts: {
          log: [{
            type: 'console',
            level: 'error'
          }]
        }
      };
      _.defaults(this.options, defaultClientOpts);

      // Create a new ES client
      // http://localhost:9200 is the default of the client already
      this.client = new elasticsearch.Client(this.options.clientOpts);
    }
  }

  // initialize builk writer with options
  initBulkWriter() {
    const bulkWriterOptions = {
      interval: this.options.flushInterval,
      waitForActiveShards: this.options.waitForActiveShards,
      pipeline: this.options.pipeline,
      ensureMappingTemplate: this.options.ensureMappingTemplate,
      mappingTemplate: this.options.mappingTemplate,
      indexPrefix: this.options.indexPrefix
    };

    this.bulkWriter = new BulkWriter(
      this.client,
      bulkWriterOptions
    );
    this.bulkWriter.start();
  }

  // Get index name from options
  getIndexName() {
    let indexName = this.options.index;
    if (indexName === null) {
      const now = moment();
      const dateString = now.format(this.options.indexSuffixPattern);
      indexName = this.options.indexPrefix + '-' + dateString;
    }
    return indexName;
  }

  // Perform the writing to the remote service
  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    this.bulkWriter.append(
      this.getIndexName(this.options),
      this.options.messageType,
      this.options.transformer({
        ...info,
        timestamp: this.options.timestamp()
      })
    );

    callback(); // write is deferred, so no room for errors here :)
  }
};


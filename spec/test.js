const expect = require('chai').expect;
const sinon = require('sinon');
const enzyme = require('enzyme');
const postgres = require('../database/postgres.js');
const server = require('../server/index.js');
const supertest = require('supertest');
const testRequest = supertest.agent(server);
const sampleGoogleProfile = require('./sampleGoogleProfile.js');
const db = require('../database/postgres.js');


describe('** Node / Express server **', function() {
  describe('The GET / route', function () {
    it('should respond with html', function (done) {
      // just assume that if it contains '<div>' it's html
      testRequest
        .get('/')
        .expect(200, /<div/, done);
    });
  });
});
// end Node / Express server tests

// =================================================================
// =================================================================
describe('** Postgres / Sequelize database set-up **', function() {
  describe('The Users table', function () {
    it('should use saveGoogleUser to create a user from a google profile', function (done) {
      postgres.saveGoogleUser(sampleGoogleProfile)
        .then(user => {
          expect(user.google_name).to.equal(sampleGoogleProfile.displayName);
          expect(user.google_id).to.equal(sampleGoogleProfile.id);
          expect(user.google_avatar).to.equal(sampleGoogleProfile.photos[0].value);
          return Promise.resolve(user);
        })
        .then(user => {
          user.destroy();
          done();
        });
    });
  });

  describe('The Room table', function () {
    it('should allow creating a room, and assign it an id', function (done) {
      postgres.Room.create({ name: 'testroom', indexKey: 0 })
        .then(room => {
          expect(room.name).to.equal('testroom');
          expect(room.indexKey).to.equal(0);
          expect(room.id).to.not.be.a('null');
          return Promise.resolve(room);
        })
        .then(room => {
          room.destroy();
          done();
        });
    });
  });

  describe('The RoomVideos table', function () {
    it('should create a join table entry and a video entry when saving a video', function (done) {
      var room;
      var video;
      postgres.Room.create({ name: 'testroom', indexKey: 0 })
        .then(createdRoom => {
          room = createdRoom;
          return postgres.createVideoEntry({
            videoName: 'fake title', // videoData.title,
            creator: 'fake creator', // videoData.creator,
            url: 'http://fakewebsite.com/12345', // videoData.url,
            description: 'the best fake video ever!!!!', // videoData.description,
          }, room.id);
        })
        .then(roomvideo => {
          expect(roomvideo.roomId).to.equal(room.id);
          expect(roomvideo.videoId).to.exist;
          return Promise.resolve(roomvideo.destroy());
        })
        .then(() => postgres.Video.findOne({
          where: { url: 'http://fakewebsite.com/12345' },
        }))
        .then(foundVideo => {
          video = foundVideo;
          expect(video.url).to.equal('http://fakewebsite.com/12345');
          return Promise.resolve(true);
        })
        .then(() => {
          room.destroy();
          video.destroy();
          done();
        })
        .catch(err => console.log('Error in roomvideo test: ', err));
    });
  });
  // end roomVideos table tests
}); // end Postgres / Sequelize database set-up tests


// =================================================================
// =================================================================
// Tests below are for the interaction of the server and database
describe('** Postgres / Sequelize database integration **', function() {
  describe('The POST /createroom route', function () {
    it('should use the "name" query parameter to create a new room', function (done) {
      // just assume that if it contains '<div>' it's html
      testRequest
        .post('/createroom?name=testroomxxxxxxx')
        .set('Accept', 'application/json')
        .then(res => {
          expect(res.status).to.equal(201);
          expect(res.body.name).to.equal('testroomxxxxxxx');
          postgres.Room.findOne({ where: { name: 'testroomxxxxxxx' } })
            .then(room => room.destroy())
            .then(() => done());
        });
    });
  });
}); // end Postgres / Sequelize integration tests

// =================================================================
// =================================================================
describe('** React client app **', function() {
  describe('The index page', function () {
    it('should exist', function (done) {
      expect(1).to.equal(0);
    });
  });
}); // end React client tests

describe('** Postgres / Sequelize database set-up **', function() {
  describe('...', function () {
    it('should...', function (done) {
      expect(1).to.equal(0);
    });
  });
});

describe('** Postgres / Sequelize database integration **', function() {
  describe('...', function () {
    it('should ...', function (done) {
      expect(1).to.equal(0);
    });
  });
});

describe('** React client **', function() {
  describe('...', function () {
    it('should...', function (done) {
      expect(1).to.equal(0);
    });
  });
});

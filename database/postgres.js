require('dotenv').config();
const _ = require('lodash');
const Sequelize = require('sequelize');

let params = { logging: false };

if (!process.env.LOCAL) {
  params = {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false,
    dialectOptions: { ssl: true },
  };
}
const sequelize = new Sequelize(process.env.DATABASE_URL, params);

sequelize.authenticate()
  .then(() => console.log('Connection has been established successfully'))
  .catch(err => console.error('Unable to connect to database:', err));

const Users = sequelize.define('users', {
  google_id: Sequelize.STRING,
  google_name: Sequelize.STRING,
  google_avatar: Sequelize.STRING,
});

const Video = sequelize.define('video', {
  videoName: Sequelize.STRING,
  creator: Sequelize.STRING,
  url: Sequelize.STRING,
  description: Sequelize.STRING,
});

// TODO we will need to refer to the Room ID when there are multiple room instances
const Room = sequelize.define('room', {
  name: Sequelize.STRING,
  indexKey: Sequelize.INTEGER,
  startTime: Sequelize.DATE,

});

// This is a join table to deal with multiple rooms each having videos
const RoomVideos = sequelize.define('roomvideos', {
  playlistPosition: Sequelize.INTEGER,
  votes: {
    type: Sequelize.INTEGER,
    defaultValue: 0,
  },
});
Video.belongsToMany(Room, { through: RoomVideos, unique: false });
Room.belongsToMany(Video, { through: RoomVideos, unique: false });

// uncomment this first time running, then comment
const dbInit = function() {
  let initRoom;
  Video.sync()
    .then(() => Room.sync())
    .then(() => createRoom('Lobby'))
    .then(room => initRoom = room)
    .then(() => RoomVideos.sync())
    .then(() => Users.sync())
    .then(() => initRoom.destroy())
    .catch(err => console.log('Error syncing in Sequelize: ', err));
};

dbInit();

const createRoom = (name) => {
  const newRoom = {
    name,
    indexKey: 0,
  };
  return Room.findOne({ where: { name } })
    .then((room) => {
      if (room) { return Promise.resolve(room); }
      return Room.create(newRoom);
    })
    .catch(err => console.error(err));
};

const createVideoEntry = (videoData, roomId) => {
  const videoEntry = {
    videoName: videoData.title,
    creator: videoData.creator,
    url: videoData.url,
    description: videoData.description,
  };
  // DO NOT CHANGE findCreateFind TO findOrCreate !!!!!11111
  return Video.findCreateFind({ where: { url: videoData.url }, defaults: videoEntry })
    .spread((video) => {
      return RoomVideos.create({
        videoId: video.id,
        roomId: roomId,
      });
    })
    .catch(err => {});
};

// Room Queries
const findRooms = () => Room.findAll();

const getRoomProperties = roomId => Room.findById(roomId)
  .then(room => room.dataValues);

// used to play next video in queue - see queueNextVideo in index.js
const incrementIndex = roomId => Room.findById(roomId)
  .then(room => {
    // console.log('\nIncrementing room indexKey');
    return room.increment('indexKey'); // increment is Sequelize tool
  })

// used to play next video in queue - see queueNextVideo in index.js
const resetRoomIndex = roomId => Room.findById(roomId)
  .then(room => {
    // console.log('\nResetting room index to 0');
    return room.update({ indexKey: 0 });
  })

const getIndex = (roomId) => {
  // console.log('getIndex request. roomId is: ', roomId);
  return Room.findById(roomId)
    .then((room) => {
      // console.log('room.indexKey is: ', room.indexKey);
      return room.indexKey;
    });
};

const setStartTime = roomId => Room.findById(roomId)
  .then(room => (
    room.update({
      startTime: Date.now(),
    })
  ));

// Video Queries
const findVideos = () => Video.findAll();

const getRoomVideos = roomId => Room.findById(roomId)
  .then(room => room.getVideos())
  .then(videos => {
    return _.orderBy(videos, ['roomvideos.votes'], ['desc']);
  });

const removeFromPlaylist = (title, roomId) => {
  let room;
  return Room.findById(roomId)
    .then((roomFound) => {
      room = roomFound;
      return Video.find({ where: { videoName: title } });
    })
    .then(video => {
      return room.removeVideo(video);
    }) // removeVideo is a function created automatically by sequelize
    .catch(err => console.log('Error removing video: ', err));
};

const findUser = user => Users.findAll({ where: { google_name: user } });

const saveGoogleUser = googleProfile => (
  Users.create({
    google_id: googleProfile.id,
    google_name: googleProfile.displayName,
    google_avatar: googleProfile.photos[0].value,
  })
    .catch(err => console.log('Error saving user: ', err))
);

const vote = (room, video, sign) => {
  if (sign === '+') {
    return RoomVideos.update({ votes: Sequelize.literal('votes + 1') }, { where: { roomId: room, videoId: video }})
  } else {
    return RoomVideos.update({ votes: Sequelize.literal('votes - 1') }, { where: { roomId: room, videoId: video }})
  }
};


exports.Room = Room;
exports.Users = Users;
exports.Video = Video;
exports.findUser = findUser;
exports.roomVideos = RoomVideos;
exports.getRoomVideos = getRoomVideos;
exports.findRooms = findRooms;
exports.createVideoEntry = createVideoEntry;
exports.getRoomProperties = getRoomProperties;
exports.incrementIndex = incrementIndex;
exports.resetRoomIndex = resetRoomIndex;
exports.getIndex = getIndex;
exports.setStartTime = setStartTime;
exports.findVideos = findVideos;
exports.removeFromPlaylist = removeFromPlaylist;
exports.db = sequelize;
exports.saveGoogleUser = saveGoogleUser;
exports.vote = vote;
exports.createRoom = createRoom;

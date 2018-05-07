const http = require('http');
const express = require('express');
const youtubeApi = require('./youtubeService');
const db = require('../database/postgres');
const passport = require('passport');
const cookieSession = require('cookie-session');
const authRoutes = require('./auth-routes');
require('../passport-setup');

const app = express();
const port = process.env.PORT;
const server = http.createServer(app);
const io = require('socket.io').listen(server);

if (module.parent) {
  module.exports = server; // this is for test suite
} else {
  server.listen(port, () => console.log(`listening on port ${port}`));
}

app.use(express.static(`${__dirname}./../client`));
const roomSpace = io.of('/room');

// const lobbySpace = io.of('/lobby');

app.use(cookieSession({
  keys: process.env.COOKIEKEY,
  maxAge: 24 * 60 * 60 * 1000, // one day
}));

app.use(passport.initialize());
app.use(passport.session());
app.use('/auth', authRoutes);

// Room HTTP Requests
app.get('/room/:roomId', (req, res) => {
  const roomId = Number(req.params.roomId);
  let room;
  const roomProperties = {};
  db.Room.findById(roomId)
    .then((result) => {
      room = result;
      roomProperties.index = room.indexKey;
      roomProperties.start = room.startTime;
      return db.getRoomVideos(roomId);
    })
    .then((videos) => {
      roomProperties.videos = videos;
      res.json(roomProperties);
    })
    .catch((err) => {
      console.error('Error in GET /:roomId ', err);
      res.sendStatus(404);
    });
});

app.get('/rooms', (req, res) => {
  db.findRooms()
    .then(rooms => res.send(rooms));
});

app.post('/createroom', (req, res) => {
  db.createRoom(req.query.name)
    .then((room) => {
      // console.log('Room created: ', room.name);
      res.status(201).send(room);
    })
    .catch(err => {
      console.error(err);
    });
});

app.get('/search', (req, res) => {
  youtubeApi.grabVideos(req.query.query)
    .then(searchResults => res.json(searchResults))
    .catch(() => res.sendStatus(404));
});

// On video end, this endpoint is called
// It gets the currentVideoIndex and does stuff
app.patch('/playNext', (req, res) => {
  console.log('Req received at /playNext...\n...req.query.length: ', req.query.length); //, req.query.roomId);
  // This length (sent from client) is state.playlist.length - 1
  const maxPlaylistIndex = req.query.length;
  const roomId = req.query.roomId;

  const sendIndex = (indexKey, roomId) => {
    console.log('Sending indexKey: ', indexKey);
    roomSpace.to(roomId).emit('playNext', indexKey);
  }; // end of sendIndex

  const queueNextVideo = (maxPlaylistIndex, currentVideoIndex) => {
    console.log(`\nQueuing next video.\n
      maxPlaylistIndex: ${maxPlaylistIndex}
      CurrentVideoIndex: ${currentVideoIndex}
      Equal? ${Number(maxPlaylistIndex) === Number(currentVideoIndex)}`);
    // Are we at the last video in the playlist? Or gone too far?
    return (Number(currentVideoIndex) >= Number(maxPlaylistIndex))
      ? db.resetRoomIndex(roomId) // Set room's indexKey to 0
      : db.incrementIndex(roomId); // Increment room's indexKey
  }; // end of queueNextVideo

  db.getIndex(roomId)
    .then(currentVideoIndex => {
      console.log('Got currentVideoIndex: ', currentVideoIndex);
      return queueNextVideo(maxPlaylistIndex, currentVideoIndex);
    })
    .then(room => sendIndex(room.indexKey, roomId))
    .then(() => db.setStartTime(roomId))
    .then(() => res.end())
    .catch(err => res.send(err));
});

// Room Socket Events
let roomHost;
const giveHostStatus = host => roomSpace.to(host).emit('host');

// Get users
app.get('/users', (req, res) => {
  db.findUser(req.query.user)
    .then(data => {
      res.send(data[0].dataValues);
    });
});

roomSpace.on('connection', (socket) => {
  console.log(`connected to ${Object.keys(socket.nsp.sockets).length} socket(s)`);

  var roomId;

  // once a client has connected, we expect to get a ping from them saying what room they want to join
  socket.on('room', function(room) {
    console.log('Client emitted room: ', room);
    socket.join(room);
    roomId = room;
  });

  roomSpace.to(socket.id).emit('id', socket.id);
  if (Object.keys(socket.nsp.sockets).length === 1) {
    roomHost = socket.id;
    giveHostStatus(roomHost);
  }

  const sendPlaylist = (roomId) => (
    db.getRoomVideos(roomId) // this gets results from join table
      .then((videos) => {
        roomSpace.to(roomId).emit('retrievePlaylist', videos);
        if (videos.length === 0) throw videos;
        if (videos.length === 1) db.setStartTime(roomId);
      })
      .catch((emptyPlaylist) => {
        // Check if the thrown item is an array rather than an Error
        if (Array.isArray(emptyPlaylist)) {
          roomSpace.to(roomId).emit('default');
        } else {
          throw emptyPlaylist;
        }
      })
      .catch(err => roomSpace.to(roomId).emit('error', err))
  );

  socket.on('saveToPlaylist', (video) => {
    const videoData = {
      title: video.snippet.title,
      creator: video.snippet.channelTitle,
      url: video.id.videoId,
      description: video.snippet.description,
    };
    return db.createVideoEntry(videoData, roomId)
      .then(() => sendPlaylist(roomId))
      .catch((err) => console.error(err));
  });

  socket.on('removeFromPlaylist', (videoName, indexOfVideoInPlaylist) => {
    // console.log('Received remove request for ', videoName);
    db.removeFromPlaylist(videoName, roomId)
      .then(() => sendPlaylist(roomId))
      .catch(err => roomSpace.to(roomId).emit('error', err));
  });

  socket.on('emitMessage', (message) => {
    // message.userName = message.userName.split('#')[1].substring(0, 8); // Pluck Socket ID
    // let sum = 0;
    // for (let i = 0; i < 3; i += 1) {f
    //   sum += message.userName.charCodeAt(i);
    // }
    // const colors = ['#ffb3ba', '#ffd2b3', '#fff8b3', '#baffb3', '#bae1ff', '#e8baff'];
    // const userColor = colors[(sum % colors.length)];
    // message.userColor = userColor;
    // var roomStatusMessage = {
    //   body: 'Welcome to room ' + roomId,
    //   userName: 'socket.io bot',
    //   dateTime: Date.now(),
    // };
    // console.log(roomId);
    // roomSpace.to(roomId).emit('pushingMessage', roomStatusMessage);

    roomSpace.to(roomId).emit('pushingMessage', message);
  });

  socket.on('vote', (room, video, sign) => {

    db.vote(room, video, sign)
      .then(console.log('VOTE BACK FROM DB'))
      .then(() => sendPlaylist(roomId))
      .catch(err => roomSpace.emit('error', err));

  });

  socket.on('disconnect', () => {
    if (Object.keys(socket.nsp.sockets).length > 0) {
      const newHost = Object.keys(socket.nsp.sockets)[0];
      console.log(`A user has disconnected from ${roomSpace.name}`);
      return (newHost === roomHost) ? null : giveHostStatus(newHost);
    }
    console.log(`${roomSpace.name} is now empty`);
  });
});

var config = require('../config');
var connect = require('connect'); // npm i connect
var cookieParser = require('cookie-parser')
var async = require('async');
var cookie = require('cookie');   // npm i cookie
var session = require('../bd/session');
var HttpError = require('../error').HttpError;
var User = require('../bd/user').User;
var HistoryMessage = require('../bd/history').HistoryMessage;

function loadSession(sid, callback) {

    // sessionStore callback is not quite async-style!
     session.store.load(sid, function(err, session) {
      if (arguments.length == 0) {
        // no arguments => no session
        return callback(null, null);
      } else {
        return callback(null, session);
      }
    });
}
  
function loadUser(session, callback) {

    if (!session.user) {
        console.log("Session %s is anonymous", session.id);
        return callback(null, null);
    }

    console.log("retrieving user ", session.user);

    User.findById(session.user, function(err, user) {
        if (err) return callback(err);

        if (!user) {
        return callback(null, null);
        }
        console.log("user findbyId result: " + user);
        callback(null, user);
    });
}

module.exports = function(server) {
    var io = require('socket.io').listen(server);
    io.set('origins', 'localhost:*');
    
    io.set('authorization', function(handshake, callback) {
    async.waterfall([
        function(callback) {
        // сделать handshakeData.cookies - объектом с cookie
        handshake.cookies = cookie.parse(handshake.headers.cookie || ''); // разобрать куку
        var sidCookie = handshake.cookies[config.get('session:key')]; // получить sid
        // var sid = connect.utils.parseSignedCookie(sidCookie, config.get('session:secret')); // снять метку с sid сделаную express
        var sid = cookieParser.signedCookie(sidCookie, config.get('session:secret'));
        loadSession(sid, callback);
        },
        function(session, callback) {
    
        if (!session) {
            callback(new HttpError(401, "No session"));
        }
    
        handshake.session = session;
        loadUser(session, callback);
        },
        function(user, callback) {
        if (!user) {
            callback(new HttpError(403, "Anonymous session may not connect"));
        }
    
        handshake.user = user;
        callback(null);
        }
    
    ], function(err) {
        if (!err) {
        return callback(null, true);
        }
    
        if (err instanceof HttpError) {
        return callback(null, false);
        }
    
        callback(err);
    });
    
    });
    
    // io.sockets.on('session:reload', function(sid) {
    //     var clients = io.sockets.clients();
    
    //     clients.forEach(function(client) {
    //         if (client.handshake.session.id != sid) return;
    
    //         loadSession(sid, function(err, session) {
    //         if (err) {
    //             client.emit("error", "server error");
    //             client.disconnect();
    //             return;
    //         }
    
    //         if (!session) {
    //             client.emit("logout");
    //             client.disconnect();
    //             return;
    //         }
    
    //         client.handshake.session = session;
    //         });
            
    //     });
    
    // });
    
    io.sockets.on('connection', function(socket) {
        var username = socket.request.user.get('username');
        // var username = socket.handshake.user.get('username');
        HistoryMessage.saveMessage(username, username + " вошёл в чат")
        socket.broadcast.emit('join', username);
    
        socket.on('message', function(text, cb) {
            HistoryMessage.saveMessage(username, text);
            socket.broadcast.emit('message', username, text);
            cb && cb();
        });
    
        socket.on('disconnect', function() {
            HistoryMessage.saveMessage(username, username + " вышел из чата");
            socket.broadcast.emit('leave', username);
        });
    
    });

  return io;
};
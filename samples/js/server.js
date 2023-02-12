/**
 * 信令服务器，注册信令消息处理函数
 */
var http = require('http');
var https = require('https');
var fs = require('fs');

var express = require('express');
var serveIndex = require('serve-index');

var socketIo = require('socket.io'); //引入socket.io

var USERCOUNT = 3; //

var log4js = require('log4js'); //开启日志
var logger = log4js.getLogger();
logger.level = 'info';

var app = express(); //实例化express
app.use(serveIndex('./')); //设置首路径，url会直接去访问该目录下的文件
app.use(express.static('./')); //可以访问目录下的所有文件

//https server
var options = {
  key: fs.readFileSync('./ca/learn.webrtc.com-key.pem'), //同步读取文件key
  cert: fs.readFileSync('./ca/learn.webrtc.com.pem'), //同步读取文件证书
};

var https_server = https.createServer(options, app);
//绑定socket.io与https服务端
var io = socketIo.listen(https_server); //io是一个节点（站点），内部有多个房间
https_server.listen(443, '0.0.0.0');
//---------实现了两个服务，socket.io与https server;都是绑定在443,复用端口

//-----处理事件
io.sockets.on('connection', (socket) => {
  //处理客户端到达的socket
  //监听客户端加入、离开房间消息
  socket.on('join', (room) => {
    socket.join(room); //客户端加入房间
    //io.sockets指io下面的所有客户端
    //如果是第一个客户端加入房间（原本房间不存在），则会创建一个新的房间
    var myRoom = io.sockets.adapter.rooms[room]; //从socket.io中获取房间
    var users = Object.keys(myRoom.sockets).length; //获取所有用户数量

    logger.info('the number of user in room is:' + users);

    //开始回复消息,包含两个数据房间和socket.id信息
    if (users < USERCOUNT) {
      socket.emit('joined', room, socket.id); //给本人
      //如果房间有其他人,发送otherjoin消息给他们
      if (users > 1) {
        socket.to(room).emit('otherjoin', room);
      }
    } else {
      //告知人满，别来
      socket.leave(room);
      socket.emit('full', room, socket.id);
    }
  });

  socket.on('leave', (room) => {
    var myRoom = io.sockets.adapter.rooms[room]; //从socket.io中获取房间
    var users = myRoom ? Object.keys(myRoom.sockets).length : 0; //获取所有用户数量
    socket.leave(room); //离开房间

    logger.info('the number of user in room is:' + (users - 1));

    socket.emit('leaved', room, socket.id); //给自己发送leaved
    socket.to(room).emit('bye', room, socket.id); //给其他人发送bye
  });

  socket.on('message', (room, msg) => {
    socket.to(room).emit('message', room, msg);
  });
});

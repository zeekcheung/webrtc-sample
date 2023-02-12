/**
 * 建立端对端连接
 * 实现媒体协商
 * 实现客户端状态机
 */

var localVideo = document.querySelector('video#localvideo');
var remoteVideo = document.querySelector('video#remotevideo');

var btnConn = document.querySelector('button#connserver');
var btnLeave = document.querySelector('button#leave');

var localStream = null; //保存本地流为全局变量
var socket = null;

var roomid = '111111';
var state = 'init'; //客户端状态机

var pc = null; //定义全局peerconnection变量

function sendMessage(roomid, data) {
  console.log('send SDP message', roomid, data);
  if (socket) {
    socket.emit('message', roomid, data);
  }
}

function getOffer(desc) {
  pc.setLocalDescription(desc);
  sendMessage(roomid, desc); //发送SDP信息到对端
}

//这里我们本机是远端，收到了对方的offer，一会需要把自己本端的数据回去！！！！！
function getAnswer(desc) {
  //在offer获取后，设置了远端描述
  pc.setLocalDescription(desc); //这里只需要设置本端了
  sendMessage(roomid, desc);
}

//媒体协商方法，发起方调用，创建offer
function negotiate() {
  if (state === 'joined_conn') {
    if (pc) {
      var options = {
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1,
      };

      pc.createOffer(options).then(getOffer).catch(handleError);
    }
  }
}

//创建peerconnection，监听一些事件：candidate，当收到candidate事件之后（TURN服务返回），之后转发给另外一端（SIGNAL 服务器实现）
//将本端的媒体流加入peerconnection中去
function createPeerConnection() {
  console.log('Create RTCPeerConnection!');
  if (!pc) {
    //设置ICEservers
    var pcConfig = {
      iceServers: [
        {
          urls: 'turn:82.156.184.3:3478',
          credential: 'ssyfj',
          username: 'ssyfj',
        },
      ],
    };
    pc = new RTCPeerConnection(pcConfig);

    pc.onicecandidate = (e) => {
      //处理turn服务返回的candidate信息,媒体协商之后SDP规范中属性获取
      if (e.candidate) {
        //发送candidate消息给对端
        console.log('find a new candidate', e.candidate);
        sendMessage(roomid, {
          type: 'candidate',
          label: e.candidate.sdpMLineIndex,
          id: e.candidate.sdpMid,
          candidate: e.candidate.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      //获取到远端的轨数据，设置到页面显示
      remoteVideo.srcObject = e.streams[0];
    };
  }

  if (localStream) {
    //将本端的流加入到peerconnection中去
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }
}

//销毁当前peerconnection的流信息
function closeLocalMedia() {
  if (localStream && localStream.getTracks()) {
    localStream.getTracks().forEach((track) => {
      track.stop();
    });
  }
  localStream = null;
}

//关闭peerconnection
function closePeerConnection() {
  console.log('close RTCPeerConnection');
  if (pc) {
    pc.close();
    pc = null;
  }
}

function conn() {
  socket = io.connect(); //与信令服务器建立连接，io对象是在前端引入的socket.io文件创立的全局对象

  //开始注册处理服务端的信令消息
  socket.on('joined', (roomid, id) => {
    console.log('receive joined message:', roomid, id);
    //修改状态
    state = 'C';
    createPeerConnection(); //加入房间后，创建peerconnection，加入流，等到有新的peerconnection加入，就要进行媒体协商

    btnConn.disabled = true;
    btnLeave.disabled = false;

    console.log('receive joined message:state=', state);
  });

  socket.on('otherjoin', (roomid, id) => {
    console.log('receive otherjoin message:', roomid, id);
    //修改状态，注意：对于一个特殊状态joined_unbind状态需要创建新的peerconnection
    if (state === 'joined_unbind') {
      createPeerConnection();
    }

    state = 'joined_conn'; //原本joined，现在变为conn
    //媒体协商
    negotiate();

    console.log('receive otherjoin message:state=', state);
  });

  socket.on('full', (roomid, id) => {
    console.log('receive full message:', roomid, id);
    state = 'leaved';
    console.log('receive full message:state=', state);
    socket.disconnect(); //断开连接，虽然没有加入房间，但是连接还是存在的，所以需要进行关闭
    alert('the room is full!');

    btnLeave.disabled = true;
    btnConn.disabled = false;
  });

  socket.on('leaved', (roomid, id) => {
    //------资源的释放在发送leave消息给服务器的时候就释放了，符合离开流程图
    console.log('receive leaved message:', roomid, id);
    state = 'leaved'; //初始状态
    console.log('receive leaved message:state=', state);

    //这里断开连接
    socket.disconnect();
    btnLeave.disabled = true;
    btnConn.disabled = false;
  });

  socket.on('bye', (roomid, id) => {
    console.log('receive bye message:', roomid, id);
    state = 'joined_unbind';
    console.log('receive bye message:state=', state);

    //开始处理peerconneciton
    closePeerConnection();
  });

  socket.on('message', (roomid, data) => {
    console.log('receive client message:', roomid, data);
    //处理媒体协商数据，进行转发给信令服务器，处理不同类型的数据，如果是流媒体数据，直接p2p转发
    if (data) {
      //只有下面3种数据，对于媒体流数据，走的是p2p路线，不经过信令服务器中转
      if (data.type === 'offer') {
        //这里表示我们本机是远端，收到了对方的offer，一会需要把自己本端的数据回去！！！！！
        pc.setRemoteDescription(new RTCSessionDescription(data)); //需要把传输过来的文本转对象
        pc.createAnswer().then(getAnswer).catch(handleError);
      } else if (data.type === 'answer') {
        pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (data.type === 'candidate') {
        //在双方设置完成setLocalDescription之后，双方开始交换candidate,每当收集一个candidate之后都会触发pc的onicecandidate事件
        var candidate = new RTCIceCandidate({
          sdpMLineIndex: data.label, //媒体行的行号 m=video ...
          candidate: data.candidate,
        }); //生成candidate，是从TURN/STUN服务端获取的，下面开始添加到本地pc中去，用于发送到远端
        //将candidate添加到pc
        pc.addIceCandidate(candidate); //发送到对端，触发对端onicecandidate事件
      } else {
        console.error('the message is invalid!', data);
      }
    }
  });

  //开始发送加入消息
  socket.emit('join', roomid);
  return;
}

function getMediaStream(stream) {
  localStream = stream; //保存到全局变量，用于传输到对端
  localVideo.srcObject = localStream; //显示在页面中，本端

  //-------与signal server进行连接，接受信令消息！！------
  conn();
}

function handleError(err) {
  console.error(err.name + ':' + err.message);
}

//初始化操作，获取本地音视频数据
function call() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('the getUserMedia is not support!');
    return;
  } else {
    var constraints = {
      video: true,
      audio: false,
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(getMediaStream)
      .catch(handleError);
  }
}

function connSignalServer() {
  //开启本地视频
  call();

  return true;
}

function leave() {
  if (socket) {
    socket.emit('leave', roomid);
  }

  //释放资源
  closePeerConnection();
  closeLocalMedia();

  btnConn.disabled = false;
  btnLeave.disabled = true;
}

//设置触发事件
btnConn.onclick = connSignalServer; //获取本地音视频数据，展示在页面，socket连接建立与信令服务器，注册信令消息处理函数，发送join信息给信令服务器
btnLeave.onclick = leave;

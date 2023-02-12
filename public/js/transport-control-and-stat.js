const localVideoEl = document.querySelector('video#local-video');
const remoteVideoEl = document.querySelector('video#remote-video');
const callBtn = document.querySelector('button#call');
const hangupBtn = document.querySelector('button#hangup');

const TURN_URL1 = `turn:turn.zeekcheung.top:3478`;
const TURN_URL2 = `turn:turn.zeekcheung.top:5349`;
const TURN_USERNAME = 'demo';
const TURN_PASSWORD = '123456';

const ROOM_NAME = '1v1 live room';

// client event log
const CONNECT_EVENT_LOG = /*   */ `=======  connected  =======`;
const JOINED_EVENT_LOG = /*    */ `=======  joined     =======`;
const OTHER_JOIN_EVENT_LOG = /* */ `=======  other-join =======`;
const FULL_EVENT_LOG = /*      */ `=======  full       =======`;
const LEAVED_EVENT_LOG = /*    */ `=======  leaved     =======`;
const BYE_EVENT_LOG = /*       */ `=======  bye        =======`;
const MESSAGE_EVENT_LOG = /*   */ `=======  message    =======`;
const DISCONNECT_EVENT_LOG = /* */ `=======  disconnect =======`;

/**
 * 本地采集的媒体流
 * @type {MediaStream}
 */
let localStream = null;

/**
 * 客户端与 Socket.IO 服务器的连接实例；
 *
 * 信令数据通过信令服务器（Socket.IO）进行传输；
 * @type {import('socket.io').Socket}
 */
let socket = null;

/**
 * 客户端与 Socket.IO 服务器连接状态
 *
 * @typedef {'init'} INIT
 * @typedef {'joined_conn'} JOINED_CONN
 * @typedef {'joined'} JOINED
 * @typedef {'joined_unbind'} JOINED_UNBIND
 * @typedef {'leaved'} LEAVED
 * @type {INIT | JOINED_CONN | JOINED | JOINED_UNBIND | LEAVED}
 */
let state = 'init';

/**
 * p2p 连接的实例；
 *
 * 媒体数据通过 p2p 连接进行传输；
 * @type {RTCPeerConnection}
 */
let pc = null;

/**
 * 连接信令服务器；
 */
async function call() {
  // 采集本地的音视频数据
  await getMediaStream();
  // 连接信令服务器
  connSignalServer();
  // 开始加入房间
  socket.emit('join', ROOM_NAME);

  // 绘制统计图
  paintStatGraph();
}

/**
 * 采集本地的音视频数据
 */
async function getMediaStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(`navigator.mediaDevices.getUserMedia() is not supported!`);
  }
  try {
    /**
     * @type {MediaStreamConstraints}
     */
    const constraints = {
      video: true,
      audio: false,
    };
    // 采集本地的音视频数据
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    // 将媒体流保存到全局，用于端对端连接
    localStream = mediaStream;
    // 将媒体数据输出到页面
    localVideoEl.srcObject = mediaStream;
    return mediaStream;
  } catch (error) {
    handleError(error);
  }
}

function handleError(err) {
  console.error(err);
}

/**
 * 连接信令服务器，并接收信令消息
 */
function connSignalServer() {
  // 连接信令服务器（同域）
  socket = io();
  // 注册事件处理函数，接收来自服务器的信令消息
  try {
    registerEventHandler();
  } catch (error) {
    handleError(error);
  }
}

/**
 * 注册事件处理函数，接收来自服务器的信令消息
 */
function registerEventHandler() {
  if (!socket) {
    throw new Error('socket is null!');
  }

  socket.on('connect', () => {
    console.log(CONNECT_EVENT_LOG);
    console.log(`socket: `, socket);

    // 成功加入房间
    socket.on('joined', (room) => {
      console.log(JOINED_EVENT_LOG);
      console.log('room: ', room);

      // 更新客户端状态
      state = 'joined';

      // 加入房间后，建立端对端连接
      createPeerConnection();

      callBtn.disabled = true;
      hangupBtn.disabled = false;

      console.log(`Client State: ${state}`);
    });

    // 其他客户端加入房间
    socket.on('other-join', (otherSocketId, room) => {
      console.log(OTHER_JOIN_EVENT_LOG);
      console.log(`otherSocketId: ${otherSocketId}`);
      console.log('room: ', room);

      /**
       * 注意:joined_unbind 状态需要创建新的端对端连接
       */
      if (state === 'joined_unbind') {
        createPeerConnection();
      }

      // 更新客户端状态
      state = 'joined_conn';
      // 有其他客户端加入时，进行媒体协商
      negotiate();

      console.log(`Client State: ${state}`);
    });

    // 房间人数已满
    socket.on('full', (room) => {
      console.log(FULL_EVENT_LOG);
      console.log('room: ', room);

      // 更新客户端状态
      state = 'leaved';
      console.log(`Client State: ${state}`);

      // 断开连接，虽然没有加入房间，但是仍然存在与服务器的连接
      socket.disconnect();

      callBtn.disabled = false;
      hangupBtn.disabled = true;
    });

    // 成功离开房间
    socket.on('leaved', () => {
      console.log(LEAVED_EVENT_LOG);

      // 更新客户端状态
      state = 'leaved';
      console.log(`Client State: ${state}`);

      // 断开与信令服务器的连接
      socket.disconnect();
      // 断开端对端连接
      closePeerConnection();

      callBtn.disabled = false;
      hangupBtn.disabled = true;
    });

    // 其他客户端离开房间
    socket.on('bye', (leavedSocketId, room) => {
      console.log(BYE_EVENT_LOG);
      console.log(`leavedSocketId: ${leavedSocketId}`);
      console.log('room: ', room);

      // 更新客户端状态
      state = 'joined_unbind';
      console.log(`Client State: ${state}`);
    });

    // 转发媒体协商数据（Offer SDP、Answer SDP、candidate）
    socket.on('message', async (data) => {
      console.log(MESSAGE_EVENT_LOG);
      console.log(`data: `, data);

      const { type } = data;
      // Offer SDP
      if (type === 'offer') {
        // 此时，本机是其他端的远端
        // 保存其他端的 Offer SDP
        const offerSDP = new RTCSessionDescription(data);
        pc.setRemoteDescription(offerSDP);
        // 给其他端应答 Answer SDP
        try {
          const answerSDP = await pc.createAnswer();
          pc.setLocalDescription(answerSDP);
          sendMessageToRoom(ROOM_NAME, answerSDP);

          bandwidthSelect.disabled = false;
        } catch (error) {
          handleError(error);
        }
      }
      // Answer SDP
      else if (type === 'answer') {
        // 保存远端的 Answer SDP
        const answerSDP = new RTCSessionDescription(data);
        pc.setRemoteDescription(answerSDP);

        bandwidthSelect.disabled = false;
      }
      // candidate
      else if (type === 'candidate') {
        /**
         * 在双方都完成 `setLocalDescription` 之后，双方开始交换 candidate
         * - 本地通过 `onicecandidate` 事件从 TURN 服务器中获取到 candidate，然后通过信令服务器转发给远端
         * - 本地从信令服务器中接收到远端转发过来的 candidate 时，通过 `addIceCandidate` 方法将其保存到本地
         */

        // 创建对端的 candidate 实例
        const candidate = new RTCIceCandidate({
          candidate: data.candidate,
          sdpMLineIndex: data.sdpMLineIndex,
          sdpMid: data.sdpMid,
        });
        // 将对端的 candidate 添加到本地，
        pc.addIceCandidate(candidate);
      }
      // 其他类型消息
      else {
        throw new Error(`the message is invalid!\ndata:${data}`);
      }
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(DISCONNECT_EVENT_LOG);
    console.log(`reason: ${reason}`);
  });
}

/**
 * 创建端对端连接 `RTCPeerConnection`，并交换 candidate
 *
 * 将本地媒体流加入到连接中，并接收远端媒体流
 */
function createPeerConnection() {
  // 创建端对端连接
  if (!pc) {
    /**
     * @type {RTCConfiguration}
     */
    const config = {
      // 配置 TURN 服务器
      iceServers: [
        {
          urls: [TURN_URL1, TURN_URL2],
          username: TURN_USERNAME,
          credential: TURN_PASSWORD,
        },
      ],
    };
    // 创建端对端连接实例
    pc = new RTCPeerConnection(config);

    // 接收到来自 TURN 服务器的 candidate 之后，将其转发给远端
    pc.onicecandidate = (e) => {
      const { candidate } = e;
      if (candidate) {
        console.log(`Find a new candidate`, candidate);

        // 将 candidate 转发给远端
        sendMessageToRoom(ROOM_NAME, {
          type: 'candidate',
          candidate: candidate.candidate,
          sdpMLineIndex: candidate.sdpMLineIndex,
          sdpMid: candidate.sdpMid,
        });
      }
    };

    // 接收来自远端的媒体数据
    pc.ontrack = (e) => {
      // e.streams 中包含所有远端的媒体流
      remoteVideoEl.srcObject = e.streams[0];
    };
  }

  // 将媒体流添加到端对端连接中
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }
}

/**
 * 向 `room` 房间中广播 `message` 消息
 * @param {string} roomName 房间名
 * @param {any} message 消息的具体内容
 */
function sendMessageToRoom(roomName, message) {
  if (!socket) {
    throw new Error('The client has not yet connected to the server');
  }
  socket.emit('message', roomName, message);
}

/**
 * 媒体协商
 */
async function negotiate() {
  if (state === 'joined_conn' && pc) {
    /**
     * @type {RTCOfferOptions}
     */
    const options = {
      offerToReceiveAudio: 1,
      offerToReceiveVideo: 1,
    };

    try {
      // 本地创建 Offer SDP
      const offerSDP = await pc.createOffer(options);
      // 本地保存 Offer SDP
      pc.setLocalDescription(offerSDP);
      // 将 Offer SDP 通过信令服务器发送给远端
      sendMessageToRoom(ROOM_NAME, offerSDP);
    } catch (error) {
      handleError(error);
    }
  }
}

/**
 * 关闭端对端连接
 */
function closePeerConnection() {
  if (pc) {
    pc.close();
    pc = null;
  }
}

/**
 * 离开房间
 */
function hangup() {
  if (socket) {
    socket.emit('leave', ROOM_NAME);
  }

  //释放资源
  closePeerConnection();
  closeLocalMedia();

  callBtn.disabled = false;
  hangupBtn.disabled = true;
}

/**
 * 停止采集媒体流
 */
function closeLocalMedia() {
  localStream?.getTracks()?.forEach((track) => {
    track.stop();
  });
  localStream = null;
}

callBtn.onclick = call;
hangupBtn.onclick = hangup;

/* =================== 传输控制 ==================== */

const bandwidthSelect = document.querySelector('select#bandwidth');

/**
 * 修改 `PeerConnection` 媒体传输的带宽
 * @param {Event} e event
 */
async function changeBandwidth(e) {
  bandwidthSelect.disabled = true;
  const bandwidth = e.target.value;
  if (bandwidth === 'unlimited') {
    return;
  }

  // 获取视频流的发送器
  const videoSender = getSenderByTrackType('video');

  // 获取传输参数
  const parameters = videoSender.getParameters();
  // 从编解码器中设置最大码率
  if (!parameters.encodings) {
    return;
  }
  parameters.encodings[0].maxBitrate = bandwidth * 1000;
  try {
    await videoSender.setParameters(parameters);
    bandwidthSelect.disabled = false;
    console.log('Success to set parameters');
  } catch (error) {
    console.error(error);
  }
}

/**
 * 通过媒体轨的类型获取 `PeerConnection` 的 `RTCRtpSender`
 * @param {string} trackType sender 的媒体轨类型
 * @returns
 */
function getSenderByTrackType(trackType) {
  if (!pc || !pc.getSenders()) {
    throw new Error(`There is no PeerConnection or no RTCRtpSender`);
  }
  // 获取所有发送器
  const senders = pc.getSenders();
  // 获取视频流的发送器
  const sender = senders.find((sender) => sender?.track?.kind === trackType);
  return sender;
}

bandwidthSelect.onchange = changeBandwidth;

/* =================== 数据统计 ==================== */
let bitrateGraph = null;
let bitrateSeries = null;
let packetGraph = null;
let packetSeries;

/**
 * 统计值
 */
let lastReport = null;

/**
 * 通过 canvas 绘制统计图
 */
function paintStatGraph() {
  bitrateSeries = new TimelineDataSeries();
  bitrateGraph = new TimelineGraphView('bitrate-graph', 'bitrate-canvas');
  bitrateGraph.updateEndDate();

  packetSeries = new TimelineDataSeries();
  packetGraph = new TimelineGraphView('packet-graph', 'packet-canvas');
  packetGraph.updateEndDate();
}

// 每秒更新统计图
setInterval(async () => {
  const videoSender = getSenderByTrackType('video');
  if (!videoSender) {
    return;
  }

  const reports = await videoSender.getStats();

  reports.forEach((report) => {
    // 获取输出带宽
    if (report.type === 'outbound-rtp') {
      // 过滤远端数据，只保留本地数据
      if (report.isRemote) {
        return;
      }

      const curTs = report.timestamp;
      const bytes = report.bytesSent;
      const packets = report.packetsSent;
      // 上面的 bytes 和 packets 是累计值。我们只需要差值
      if (lastResult && lastResult.has(report.id)) {
        const biterate =
          (8 * (bytes - lastResult.get(report.id).bytesSent)) /
          (curTs - lastResult.get(report.id).timestamp);
        const packetCnt = packets - lastResult.get(report.id).packetsSent;

        bitrateSeries.addPoint(curTs, biterate);
        bitrateGraph.setDataSeries([bitrateSeries]);
        bitrateGraph.updateEndDate();

        packetSeries.addPoint(curTs, packetCnt);
        packetGraph.setDataSeries([packetSeries]);
        packetGraph.updateEndDate();
      }
    }
  });

  lastResult = reports;
}, 1000);

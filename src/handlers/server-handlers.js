const { ROOM_SIZE } = require('../common/constant');

/**
 *
 * @param {import('socket.io').Server} io
 * @returns
 */
const serverHandlerFactory = (io) => {  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() data: string,
    @ConnectedSocket() client: Socket,
  ): string {
    console.log(data);
    client.emit('response', 'this is a response message.');
    return 'hhh';
  }
  /**
   * `io.on('join', handleJoin)`
   * 处理客户端加入房间事件
   * @param {string} roomName 需要加入的房间名
   */
  const handleJoin = function (roomName) {
    // 获取 socket 实例
    const socket = this;
    // 先加入房间（如果房间不存在的话就会自动创建）
    socket.join(roomName);

    // 获取 rooms Map
    const rooms = io.of('/').adapter.rooms;
    // 获取当前房间
    const room = rooms.get(roomName); // Set<SocketID>

    if (room.size > ROOM_SIZE) {
      // 如果当前房间人数已满，则拒绝客户端加入
      socket.leave(roomName);
      socket.emit('full', room);
    } else {
      // 通知客户端已加入房间
      socket.emit('joined', room);
      // 如果房间内还有其他人，则进行广播
      if (room.size > 1) {
        socket.to(roomName).emit('other-join', socket.id, room);
      }
    }

    console.log(`The number of user in ${roomName} room is: ${room.size}`);
    console.log(`${roomName}: `, room);
  };

  /**
   * `io.on('leave', handleLeave)`
   * 处理客户端离开房间事件
   * @param {string} roomName 需要离开的房间名
   */
  const handleLeave = function (roomName) {
    // 获取 socket 实例
    const socket = this;
    // 获取 rooms Map
    const rooms = io.of('/').adapter.rooms;
    // 获取当前房间
    const room = rooms.get(roomName); // Set<SocketID>

    // if (!room) {
    //   return socket.emit('error', `No ${roomName} room!`);
    // }
    // 客户端离开房间
    socket.leave(roomName);
    // 通知客户端已经离开房间
    socket.emit('leaved');
    // 通知房间内其他客户端
    socket.to(roomName).emit('bye', socket.id, room);

    console.log(`The number of user in ${roomName} room is: ${room.size}`);
    console.log(`${roomName}: `, room);
  };

  /**
   * `io.on('message', handleMessage)`
   * 处理客户端发送消息事件
   * @param {string} roomName 发送消息的房间名
   * @param {any} data 发送的具体消息
   */
  const handleMessage = function (roomName, data) {
    // 获取 socket 实例
    const socket = this;
    // 广播给房间内其他客户端
    socket.to(roomName).emit('message', data);
  };

  return {
    handleJoin,
    handleLeave,
    handleMessage,
  };
};

module.exports = serverHandlerFactory;

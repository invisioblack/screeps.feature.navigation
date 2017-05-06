
let mod = {};
module.exports = mod;

// copy locally to have at hand during later calls (from different context)
const ROOMPATH_VALILDITY = context.settings.ROOMPATH_VALILDITY;
const TRAVELPATH_VALILDITY = context.settings.TRAVELPATH_VALILDITY;
const BLOCKED_ROOMS = context.settings.BLOCKED_ROOMS;

// For use with PathFinder Results
function serializePath(result, fromPos, toPos, trimEnd = false){
    let path = '';
    //let reversePath = '';
    let lastPos = fromPos;
    for(let i=0; i<result.path.length; i++) {
        let pos = result.path[i];
        let dir = global.getDirection(lastPos, pos);
        if( dir !== null ){
            path += dir.toString();
            //reversePath = pathInversion[dir] + reversePath;
        }
        lastPos = pos;
        if( trimEnd && pos.roomName === toPos.roomName ) 
            return path;
    }

    return path;
}

function findRoute(fromRoomName, toRoomName, checkOwner = true, preferHighway = true){
    if (fromRoomName === toRoomName)  return [];

    return Game.map.findRoute(fromRoomName, toRoomName, {
        routeCallback(roomName) {
            if( roomName === toRoomName ) return 1;
            if( BLOCKED_ROOMS.includes(roomName) ) return Infinity;

            let isMyOrNeutralRoom = false;
            if( checkOwner ){
                let room = Game.rooms[roomName];
                isMyOrNeutralRoom = (room != null) && (room.my || room.myReservation || room.owner === null ); // allows foreign reserved rooms (if visible)
            }

            if (isMyOrNeutralRoom)
                return 1;
            else if (preferHighway && Room.isHighwayRoom(roomName))
                return 3;
            else if( Game.map.isRoomAvailable(roomName))
                return (checkOwner || preferHighway) ? 11 : 1;
            return Infinity;
        }
    });
}

function findLocalPath(from, to, ignoreCreeps = true, maxRooms = null){
    let path = from.findPathTo(to, {
        serialize: true,
        ignoreCreeps, 
        maxRooms
    });
    if( path && path.length > 4 ){
        path = path.substr(4);
        return path;
    }
    return null;
}
function findGlobalPath(from, to){    
    const routeRange = global.routeRange(from.roomName, to.roomName);
    const local = routeRange === 0;
    const route = local ? [from.roomName] : findRoute(from.roomName, to.roomName, true, routeRange > 4).map(r => r.room);
    maxRooms = local ? 1 : route.length+1;
    let matrices = global.partition['matrices'].data;
    const ret = PathFinder.search(
        from, 
        {
            pos: to,
            range: 1
        }, 
        {
            plainCost: 2,
            swampCost: 10,
            heuristicWeight: 1.5,
            maxRooms,
            maxOps: 4000,

            roomCallback: function(roomName) {
                // Invalid (not on route)
                if( roomName !== from.roomName && !route.includes(roomName) ) 
                    return false;
                let room = Game.rooms[roomName];
                // Visibility -> use cached deserialized cost matrix
                if( room != null ) 
                    return room.costMatrix;
                // Deserialize cost matrix from memory
                if( matrices[roomName] != null ) 
                    return PathFinder.CostMatrix.deserialize(matrices[roomName]);
                // default
                return;
            }
        }
    );
    return serializePath(ret, from, to, true);
}

function posToString(pos){
    return `${pos.roomName}x${pos.x}y${pos.y}`;
}

mod.find = function(from, to, ignoreCreeps = true){
    const local = from.roomName === to.roomName;
    const maxRooms = local ? 1 : null;
    if( ignoreCreeps === false ){
        return findLocalPath(from, to, ignoreCreeps, maxRooms);
    } else {
        const fromKey = posToString(from);
        const toKey = local ? posToString(to) : to.roomName;
        let partition = local ? 
            global.partition['roomPath'] : 
            global.partition['travelPath'];
        let data = partition.data;

        // get stored path
        if(data[fromKey] !== undefined) {
            let cachedPath = data[fromKey][toKey];
            if( cachedPath != null){
                if( cachedPath.p == null || cachedPath.t < Game.time ){
                    delete data[fromKey][toKey];
                } else 
                    return data[fromKey][toKey].p;
            }
        }

        // calculate new path
        const path = local ? 
            findLocalPath(from, to, ignoreCreeps, maxRooms) : 
            findGlobalPath(from, to);

        // save new path
        if( data[fromKey] === undefined) data[fromKey] = {};
        if( data[fromKey][toKey] === undefined) data[fromKey][toKey] = {};
        const timeout = local ? 
            Game.time + ROOMPATH_VALILDITY : 
            Game.time + TRAVELPATH_VALILDITY;
        data[fromKey][toKey].p = path;
        data[fromKey][toKey].t = timeout;
        partition.data = data;
        return path;
    }
};

/*
const pathInversion = {
    '1':'5',
    '2':'6',
    '3':'7',
    '4':'8',
    '5':'1',
    '6':'2',
    '7':'3',
    '8':'4',
};
*/

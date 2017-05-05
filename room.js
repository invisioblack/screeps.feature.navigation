
let mod = {};
module.exports = mod;

mod.extend = function(){
    Object.defineProperties(Room.prototype, {
        'costMatrix': {
            configurable: true,
            get: function () {
                let tape = global.partition['matrices'] ? global.partition['matrices'].data : null;
                if( tape == null ) {
                    log('Missing costMatrices tape', {
                        roomName: this.name, 
                        severity: 'error', 
                        scope: 'Memory'
                    });
                    return null;
                } else {
                    let tapeTime = tape[`${this.name}_time`];
                    if( tapeTime != null && tapeTime > Game.time-COST_MATRIX_VALIDITY ){
                        if( this.deserializedCostMatrix === undefined ) this.deserializedCostMatrix = PathFinder.CostMatrix.deserialize(tape[this.name]);
                        return this.deserializedCostMatrix;
                    }
                    
                    log('Calculating cost matrix', {
                        roomName: this.name, 
                        severity: 'verbose', 
                        scope: 'PathFinding'
                    });

                    let costMatrix = new PathFinder.CostMatrix;
                    let setCosts = structure => {
                        if(structure.structureType == STRUCTURE_ROAD) {
                            costMatrix.set(structure.pos.x, structure.pos.y, 1);
                        } else if(structure.structureType !== STRUCTURE_RAMPART ) { //|| !structure.isPublic
                            costMatrix.set(structure.pos.x, structure.pos.y, 0xFF);
                        }
                    };
                    this.structures.all.forEach(setCosts);

                    this.deserializedCostMatrix = costMatrix;
                    tape[this.name] = costMatrix.serialize();
                    tape[`${this.name}_time`] = Game.time;
                    global.partition['matrices'].data = tape;
                    return costMatrix;
                }
            }
        },
        'currentCostMatrix': {
            configurable: true,
            get: function () {
                if ( this._currentCostMatrix === undefined ) {
                    let costs = this.costMatrix;
                    // Avoid creeps in the room
                    this.allCreeps.forEach(function(creep) {
                        costs.set(creep.pos.x, creep.pos.y, 0xff);
                    });
                    this._currentCostMatrix = costs;
                }
                return this._currentCostMatrix;
            }
        }
    });
};

mod.calcCoordinates = function(roomName, callBack){
    if( callBack == null ) return null;
    let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
    let x = parsed[1] % 10;
    let y = parsed[2] % 10;
    return callBack(x,y);
};
mod.isCenterRoom = function(roomName){
    return Room.calcCoordinates(roomName, (x,y) => {
        return x === 5 && y === 5;
    });
};
mod.isCenterNineRoom = function(roomName){
    return Room.calcCoordinates(roomName, (x,y) => {
        return x > 3 && x < 7 && y > 3 && y < 7;
    });
};
mod.isControllerRoom = function(roomName){
    return Room.calcCoordinates(roomName, (x,y) => {
        return x !== 0 && y !== 0 && (x < 4 || x > 6 || y < 4 || y > 6);
    });
};
mod.isSKRoom = function(roomName){
    return Room.calcCoordinates(roomName, (x,y) => {
        return x > 3 && x < 7 && y > 3 && y < 7 && (x !== 5 || y !== 5);
    });
};
mod.isHighwayRoom = function(roomName){
    return Room.calcCoordinates(roomName, (x,y) => {
        return x === 0 || y === 0;
    });
};
mod.roomDistance = function(roomName1, roomName2, diagonal, continuous){
    if( diagonal ) return Game.map.getRoomLinearDistance(roomName1, roomName2, continuous);
    if( roomName1 === roomName2 ) return 0;
    let posA = roomName1.split(/([N,E,S,W])/);
    let posB = roomName2.split(/([N,E,S,W])/);
    let xDif = posA[1] === posB[1] ? Math.abs(posA[2]-posB[2]) : posA[2]+posB[2]+1;
    let yDif = posA[3] === posB[3] ? Math.abs(posA[4]-posB[4]) : posA[4]+posB[4]+1;
    //if( diagonal ) return Math.max(xDif, yDif); // count diagonal as 1
    return xDif + yDif; // count diagonal as 2
};
mod.nearestOwnedRoom = function(targetRoomName) {
    let range = room => room.my ? routeRange(room.name, targetRoomName) : Infinity;
    return _.min(Game.rooms, range);
};

// get movement range between rooms
// respecting environmental walls
// uses memory to cache for ever
mod.routeRange = function(fromRoom, toRoom){
    if( fromRoom === toRoom ) return 0;
    if( global.partition['ranges'] == null || global.partition['ranges'].data == null ) 
        return null;
    let ranges = global.partition['ranges'].getObject(fromRoom);
    if( ranges[toRoom] != null ) return ranges[toRoom];
    else {
        // ensure start room object
        let room = null;
        if( fromRoom instanceof Room ) room = fromRoom;
        else room = Game.rooms[fromRoom];
        if( _.isUndefined(room) ) return Room.roomDistance(fromRoom, toRoom, false);
        // get valid route to room (respecting environmental walls)
        let route = room.findRoute(toRoom, false, false);
        if( _.isUndefined(route) ) return Room.roomDistance(fromRoom, toRoom, false);
        const range = route == ERR_NO_PATH ? Infinity : route.length;
        global.partition['ranges'].set(data => {
            data[fromRoom][toRoom] = range;
        });
        return range;
    }
};
mod.getDirection = function(fromPos, toPos){
    let dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
    let adx = Math.abs(dx), ady = Math.abs(dy);
    if( dx === 0 && dy === 0 ) return null;
    if(toPos.roomName !== fromPos.roomName) {
        return null;
    } else {
        if(adx > ady*2) {
            if(dx > 0) return global.RIGHT;
            else return global.LEFT;
        }
        else if(ady > adx*2) {
            if(dy > 0) return global.BOTTOM;
            else return global.TOP;
        }
        else {
            if(dx > 0 && dy > 0) return global.BOTTOM_RIGHT;
            if(dx > 0 && dy < 0) return global.TOP_RIGHT;
            if(dx < 0 && dy > 0) return global.BOTTOM_LEFT;
            if(dx < 0 && dy < 0) return global.TOP_LEFT;
        }
    }
};

let _findPath = function(from, to, ignoreCreeps = true, maxRooms = null){
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
mod.findRoute = function(fromRoomName, toRoomName, checkOwner = true, preferHighway = true){
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
};
mod.getPath = function(from, to, ignoreCreeps = true){
    let routeRange = global.routeRange(from.roomName, to.roomName);
    const local = routeRange === 0;
    let maxRooms = local ? 1 : null;
    if( !ignoreCreeps ){
        return _findPath(from, to, ignoreCreeps, maxRooms);
    } else/* if( local ){
        // use Room search
        return _findPath(from, to, ignoreCreeps, maxRooms);
    } else */
    {
        let data;
        if( local ) 
            data = global.partition['roomPath'] ? global.partition['roomPath'].data : null;
        else
            data = global.partition['travelPath'] ? global.partition['travelPath'].data : null;
        if( data == null ) {
            return _findPath(from, to, ignoreCreeps, maxRooms);
        } else {
            // get stored path
            const fromKey = global.posToString(from);
            const toKey = local ? global.posToString(to) : to.roomName;
            if(data[fromKey] !== undefined) {
                let cachedPath = data[fromKey][toKey];
                if( cachedPath != null){
                    if( cachedPath.p == null || cachedPath.t < Game.time ){
                        delete data[fromKey][toKey];
                    } else 
                        return data[fromKey][toKey].p;
                }
            }

            let path = null;
            // calculate new path
            if(local){
                path = _findPath(from, to, ignoreCreeps, maxRooms);
            }
            else /*if( routeRange === 1 ){
                path = _findPath(from, to);
            } else */
            {
                let route = local ? [from.roomName] : Room.findRoute(from.roomName, to.roomName, true, routeRange > 4).map(r => r.room);
                maxRooms = local ? 1 : route.length+1;
                let tape = global.partition['matrices'].data;
                let ret = PathFinder.search(
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
                            if( tape[roomName] != null ) 
                                return PathFinder.CostMatrix.deserialize(tape[roomName]);
                            // default
                            return;
                        }
                    }
                );
                path = global.serializePath(ret, from, to, true);
            }

            // save new path
            if( data[fromKey] === undefined) data[fromKey] = {};
            if( data[fromKey][toKey] === undefined) data[fromKey][toKey] = {};
            data[fromKey][toKey].p = path;
            if( local ){
                data[fromKey][toKey].t = Game.time + ROOMPATH_RECALCULATION; // timeout
                global.partition['roomPath'].data = data;
            }
            else{
                data[fromKey][toKey].t = Game.time + TRAVELPATH_RECALCULATION; // timeout
                global.partition['travelPath'].data = data;
            }
            return path;
        }
    }
};

let pathInversion = {
    '1':'5',
    '2':'6',
    '3':'7',
    '4':'8',
    '5':'1',
    '6':'2',
    '7':'3',
    '8':'4',
};
// For use with PathFinder Results
mod.serializePath = function(result, fromPos, toPos, trimEnd = false){
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
};

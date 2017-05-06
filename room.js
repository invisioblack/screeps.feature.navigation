
const COST_MATRIX_VALIDITY = 10010;

let mod = {};
module.exports = mod;

mod.extend = function(){
    Object.defineProperties(Room.prototype, {
        'costMatrix': {
            configurable: true,
            get: function () {
                let partition = global.partition['matrices'];
                let data = partition.data;
                const timeout = data[`${this.name}_time`];

                if( timeout != null && timeout > Game.time ){
                    if( this.deserializedCostMatrix === undefined ) this.deserializedCostMatrix = PathFinder.CostMatrix.deserialize(data[this.name]);
                    return this.deserializedCostMatrix;
                }
                
                log('Calculating cost matrix', {
                    roomName: this.name, 
                    severity: 'verbose', 
                    scope: 'PathFinding'
                });

                let costMatrix = new PathFinder.CostMatrix;
                const setCosts = structure => {
                    if(structure.structureType == STRUCTURE_ROAD) {
                        costMatrix.set(structure.pos.x, structure.pos.y, 1);
                    } else if(structure.structureType !== STRUCTURE_RAMPART ) { //|| !structure.isPublic
                        costMatrix.set(structure.pos.x, structure.pos.y, 0xFF);
                    }
                };
                const structures = this.find(FIND_STRUCTURES);
                structures.forEach(setCosts);

                this.deserializedCostMatrix = costMatrix;
                data[this.name] = costMatrix.serialize();
                data[`${this.name}_time`] = Game.time + COST_MATRIX_VALIDITY;
                partition.data = data;
                
                return costMatrix;
            }
        },
        'currentCostMatrix': {
            configurable: true,
            get: function () {
                if ( this._currentCostMatrix === undefined ) {
                    let matrix = this.costMatrix;
                    let creeps = this.find(FIND_CREEPS);
                    // Avoid creeps in the room
                    creeps.forEach( creep => matrix.set(creep.pos.x, creep.pos.y, 0xff) );
                    this._currentCostMatrix = matrix;
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

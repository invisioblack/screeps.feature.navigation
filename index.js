
let mod = {};
module.exports = mod;

mod.install = function(){
    context.requiresMemory = false;
    context.memoryPartitions = ['ranges', 'matrices', 'roomPath', 'travelPath'];
    context.inject(Room, 'room');
    context.inject(PathFinder, 'pathFinder');
};

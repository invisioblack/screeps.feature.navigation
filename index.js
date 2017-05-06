
let mod = {};
module.exports = mod;

mod.dependencies = [];
mod.install = function(){
    context.requiresMemory = false;
    context.memoryPartitions = ['ranges', 'matrices', 'roomPath', 'travelPath'];

    context.defaultValue('BLOCKED_ROOMS', []);
    context.defaultValue('ROOMPATH_VALILDITY', 5020);
    context.defaultValue('TRAVELPATH_VALILDITY', 40010);
    context.defaultValue('COST_MATRIX_VALIDITY', 10010);

    context.inject(Room, 'room');
    context.inject(PathFinder, 'pathFinder');
};

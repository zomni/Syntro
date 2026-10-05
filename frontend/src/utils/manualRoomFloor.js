/////////////////////////////////////////////////////////////////////////////////
///////////////////// Which manual rooms belong to a floor ///////////////////////
/////////////////////////////////////////////////////////////////////////////////

export const shouldRenderRoomForFloor = (room, floorNumber, allowedBuildingIds) => {
  if (!room) {
    return false;
  }

  if (allowedBuildingIds && !allowedBuildingIds.has(room.buildingExternalId)) {
    return false;
  }

  const roomFloor = Number(room.floor);
  const targetFloor = Number(floorNumber);

  return Number.isFinite(roomFloor) && roomFloor === targetFloor;
};
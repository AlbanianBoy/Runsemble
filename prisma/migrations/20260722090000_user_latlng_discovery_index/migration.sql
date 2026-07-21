-- Discovery now filters users by a lat/lng bounding box (/api/users). Without a
-- b-tree on those columns the range predicate sequentially scans every user on
-- every map load. Additive, no data change.

CREATE INDEX "User_lat_lng_idx" ON "User"("lat", "lng");

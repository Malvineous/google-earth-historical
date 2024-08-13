## Google Earth Downloader

Based extensively on https://github.com/ConorPai/GEDownload

This script is able to download and decrypt historical satellite tiles from
Google Earth, and save them in XYZ format that can be loaded by GIS software
such as QGIS.

It still needs a lot of work.  Unresolved issues are:

 * Google's tiles are squashed, so although they are 256x256 they seem to need
   to be stretched to more like 256x288.  I don't know enough about GIS to know
   whether this is the right solution, or whether a different CRS is a better
   solution.

 * Instead of downloading the GE tiles then converting them to XYZ, it would be
   better to figure out which XYZ tiles are needed, then download the matching
   GE tiles.  This would make it easier in the event that multiple GE tiles need
   to be read to produce one XYZ-compliant tile.

 * The concurrency is quick and dirty, downloading every tile in a row at the
   same time.  It would be better to use p-limit or similar to set a fixed
   number of concurrent downloads.

 * It is unknown how to figure out the current `version` value.  I had to use
   mitmproxy to monitor Google Earth's HTTPS requests to figure it out.

 * The date calculation code from GEDownload no longer appears to produce
   correct results.  It would be good to figure out this algorithm so satellite
   acquisition dates from GE can be entered, instead of having to grab it from
   the end of GE URLs with mitmproxy.

It works by downloading all the Google tiles into a cache folder, and then
processing them (which includes decrypting them).  It is done this way so that
after all the tiles have been downloaded, you can repeatedly process them to
get the output right, without hitting the servers repeatedly and risking being
blocked.

### Warnings

Using this probably violates Google's terms of service.  Use it at your own
risk.

If you download too many tiles, or download them slowly over a long period,
Google will detect this as automated access and block your IP address.

You need a decryption key called `dbRoot.v5` in order to decrypt the tiles,
which is not included in this repository.  You should be able to find it easily
enough though if you read these instructions carefully, unless of course Google
go and change it.

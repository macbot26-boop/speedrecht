# Lokaler Entwicklungs-Messserver: baut den offiziellen ias-server (C++)
# der Breitbandmessung aus dem Quellcode. Nur für die lokale Entwicklung —
# der Produktions-Peer läuft später auf einem gemieteten Server in Frankfurt.
#
# Upstream (AGPLv3, zafaco GmbH / Bundesnetzagentur), reproduzierbar gepinnt:
#   ias-server  https://github.com/breitbandmessung/ias-server   @ IAS_SERVER_REF
#   ias-libtool https://github.com/breitbandmessung/ias-libtool  @ (Submodule)
#   nopoll      https://github.com/zafaco/nopoll                 @ NOPOLL_REF

FROM debian:bookworm AS build

ARG NOPOLL_REF=1908ad507bf8b9011892ba1218288eaa0eb5f158
ARG IAS_SERVER_REF=26c9cdef9ee3c67b6878535cd60d04403a897cc4

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates build-essential cmake pkg-config \
    automake autoconf libtool \
    libssl-dev liblog4cpp5-dev \
    && rm -rf /var/lib/apt/lists/*

# 1) nopoll (WebSocket-Bibliothek, zafaco-Fork)
RUN git clone https://github.com/zafaco/nopoll.git /src/nopoll \
    && cd /src/nopoll && git checkout ${NOPOLL_REF}
WORKDIR /src/nopoll
RUN ./autogen.sh && make -j"$(nproc)" && make install && ldconfig

# 2) ias-server (inkl. ias-libtool als Submodule)
RUN git clone --recurse-submodules https://github.com/breitbandmessung/ias-server.git /src/ias-server \
    && cd /src/ias-server && git checkout ${IAS_SERVER_REF} \
    && git submodule update --init --recursive
WORKDIR /src/ias-server
RUN cmake -DCMAKE_BUILD_TYPE=Release . && make -j"$(nproc)"
# Binärdatei + mitgebaute Bibliotheken (libiastool) robust einsammeln
RUN IAS_BIN="$(find /src/ias-server -type f -name ias-server -perm -111 | head -1)" \
    && test -n "$IAS_BIN" && cp "$IAS_BIN" /usr/local/bin/ias-server \
    && find /src/ias-server -type f -name "libiastool.so*" -exec cp {} /usr/local/lib/ \;

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    liblog4cpp5v5 libssl3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/local/lib/libnopoll* /usr/local/lib/
COPY --from=build /usr/local/lib/libiastool.so* /usr/local/lib/
COPY --from=build /usr/local/bin/ias-server /usr/local/bin/ias-server
RUN ldconfig \
    && mkdir -p /etc/ias-server /var/log/ias-server /var/opt/ias-server/certs

COPY config.json /etc/ias-server/config.json
COPY trace.ini   /etc/ias-server/trace.ini

# 80 = ws (Messung), 443 = wss (lokal ungenutzt, kein Zertifikat),
# 8080/8443 = Traceroute-Endpunkt (lokal ungenutzt), udp/80 = nur Desktop-Client
EXPOSE 80

# Vordergrund (kein -d), damit Docker den Prozess überwacht
CMD ["/usr/local/bin/ias-server"]

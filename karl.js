export default {
    async fetch(request) {
        const config = {
            inbounds: [],
            outbounds: [
                {
                    mux: {
                        enabled: false
                    },
                    protocol: "vless",
                    settings: {
                        vnext: [
                            {
                                address: "michezobet.com",
                                port: 80,
                                users: [
                                    {
                                        encryption: "none",
                                        id: "53fa8faf-ba4b-4322-9c69-a3e5b1555049",
                                        level: 8
                                    }
                                ]
                            }
                        ]
                    },
                    streamSettings: {
                        network: "ws",
                        security: "none",
                        wsSettings: {
                            headers: {
                                Host: "301.pooriam.ir"
                            },
                            path: "/?ed=MARAMBASHI_MARAMBASHI/?ed=2560"
                        }
                    },
                    tag: "VLESS"
                }
            ],
            policy: {
                levels: {
                    "8": {
                        connIdle: 300,
                        downlinkOnly: 1,
                        handshake: 4,
                        uplinkOnly: 1
                    }
                }
            }
        };

        return new Response(JSON.stringify(config, null, 2), {
            headers: { "Content-Type": "application/json" }
        });
    }
};

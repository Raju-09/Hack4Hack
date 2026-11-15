# Benchmark Environment Specification

- **Date:** 2026-11-15
- **Operating System:** Windows 11 Enterprise / Ubuntu 22.04 LTS (CI Container)
- **Node.js Runtime:** v20.18.0 / v22.20.0 (x64)
- **Database Engine:** MongoDB 7.0.5 Community Edition (3-Node Replica Set `rs0`)
- **Memory Allocation:** 16 GB RAM DDR5
- **Processor:** 12th Gen Intel Core i7 / AMD Ryzen 7 (8 cores, 16 threads)
- **Tooling:**
  - `k6` v0.51.0
  - `vitest` v2.1.6
  - `tsx` v4.19.2
- **Network Interface:** Loopback virtual bridge (zero external internet lag)

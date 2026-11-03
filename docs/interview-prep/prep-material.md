The components that come up most often in interviews
If you're short on study time, prioritize these:
Load balancer → distribute traffic.
Stateless application servers → horizontally scale compute.
SQL vs NoSQL databases → choose appropriate persistence.
Indexes → improve database read performance.
Replication / read replicas → availability + read scalability.
Sharding / partitioning → scale databases horizontally.
Redis/cache → lower latency and database load.
CDN → cache content geographically near users.
Message queue → asynchronous processing.
Kafka/event streaming → high-volume distributed event processing.
Object storage → images, videos, files.
Search engine → full-text/search workloads.
API gateway → centralized API routing/security/rate limiting.
Rate limiter → protect services from excessive traffic.
Workers → process background jobs.
Retries + timeout + circuit breaker → distributed-system resilience.
Monitoring/logging/tracing → production observability.
Autoscaling → dynamically adjust capacity.
Multi-AZ / replication → high availability.
Consistent hashing → distribute cache/shard keys while minimizing remapping.
1. Rate Limiting (Why it needs State)
Rate limiting requires knowing the answer to: "How many times has Client X hit this API in the last 60 seconds?"
The Mechanism: When a request arrives, the gateway extracts a unique identifier (like an IP address or an API key).
The State Check: It looks up this key in its memory store (e.g., Redis). If the counter for that key is less than the limit (say, 99 out of 100), the gateway increments the counter and lets the request pass.
The Block: If the counter is at 100, the gateway immediately drops the request and returns an HTTP 429 Too Many Requests error, saving your backend servers from getting overwhelmed.
2. Authentication & Authorization
Instead of forcing every single microservice to write code to check passwords or validate tokens, the gateway handles it once at the front door.
The Mechanism: The client sends a request with an Authorization: Bearer <token> header (like a JWT).
The Validation: The gateway decrypts and verifies the token's cryptographic signature using a public key. It checks the expiration date and ensures the token hasn't been blacklisted.
The Result: If valid, the gateway passes the request onward. It may also strip the messy token and pass clean user data (like X-User-ID: 12345) to the backend services.
3. Request Transformation
Clients (like mobile apps) and internal microservices often speak different "languages" or expect different data formats.
The Mechanism: A mobile app might send a modern POST request with a clean JSON payload.
The Transformation: The API gateway intercepts this and translates it on the fly. It can inject missing headers, strip out sensitive internal fields, or even map the JSON into a legacy XML format or a high-performance gRPC payload required by an older backend service.
4. API Versioning
When you upgrade your software, you cannot break the API for older mobile apps that users haven't updated yet. The gateway acts as a smart router to manage this seamlessly.
The Mechanism: The gateway evaluates incoming paths or headers (e.g., ://api.com vs ://api.com, or an Accept-Version: 2.0 header).
The Routing: Without the client knowing it, the gateway routes the v1 request to your old legacy server cluster, and the v2 request to your brand-new microservices cluster. This decouples your backend deployment cycle from your user-facing interface.


Why Infrastructure Wins Over Application Code
Building an API gateway inside NestJS means your application code has to handle massive amounts of raw networking tasks (decrypting SSL, managing thousands of concurrent connections, parsing data packets).
Dedicated infrastructure tools are written in highly optimized, lower-level languages (like C or Go) explicitly designed to route millions of requests with sub-millisecond latency. Writing a gateway in Node.js/NestJS often introduces a performance bottleneck because Node.js is single-threaded.

Approach 1: The Cloud/Infrastructure Way (Recommended)
In this model, you don't write code; you write configuration files or use a cloud console.
Option A: Managed Cloud (AWS API Gateway)
If you are already in AWS, this is entirely a configuration task.
Create the Gateway: You go to the AWS Console (or use Terraform/CloudFormation) and create an "HTTP API" or "REST API".
Define Routes: You configure routes visually or via config (e.g., ANY /users goes to a specific Load Balancer or Lambda function).
Turn on Features: You check boxes or attach policies to enable JWT Authorizers, Rate Limiting (throttling), and CORS. AWS manages the scaling and servers for you entirely.



The key interview mindset is not merely saying "I'll add Redis/Kafka/Kubernetes." Explain the problem each component solves. For example:
"Reads are overwhelming the primary database, so I'd first add caching for hot objects and read replicas for queries that can tolerate replica lag."
That type of requirement → bottleneck → architectural component → tradeoff reasoning is what system-design interviewers are usually evaluating.

Core idea: fan-out on write. When someone posts:
Post -> Kafka->Feed Workers->
 ├── add post to follower A feed
 ├── add post to follower B feed
 └── add post to follower C feed
For celebrities with millions of followers, use fan-out on read or a hybrid. Main topics: Kafka, caching, denormalization, fan-out, celebrity problem.
--> CDN —> Viewer
Amazon S3 (Object Storage) natively interfaces with a queue. It is a built-in feature of modern cloud storage providers called Object Storage Event Notifications. You do not need to write application code to pull the video out of S3 and push it into a queue; S3 handles it automatically.
Here is why this exact flow makes perfect sense and how the S3-to-queue mechanism works under the hood.

How S3 Natively Interfaces with a Queue
When the Upload Service finishes saving a raw .mp4 file into Object Storage (S3), S3 triggers an event notification.
The Event: You configure an S3 Event Notification rule that says: "Whenever a new file is successfully created in this specific folder, fire an event." [1]
The Destination: You point that rule directly to your Queue (like AWS SQS).
The Payload: S3 automatically generates a small JSON message and drops it into the queue. Crucially, this message does not contain the massive video file. It only contains metadata, looking something like this:
Json
{ "eventName": "ObjectCreated:Put", "bucket": "my-raw-videos-bucket", "videoKey": "user-123/my-travel-vlog.mp4" }
Why This Design Makes Sense (The Architecture Breakdown)
If you didn't use this exact asynchronous, queue-based flow, your system would crash or cost an astronomical amount of money to run. Here is the engineering logic behind the design:
1. Decoupling the Upload from the Transcoding (The Queue's Role)
Videos are massive files. Transcoding a 4K video into 360p, 720p, and 1080p takes significant time, CPU power, and memory.
Without the Queue: The Upload Service would have to wait around for the video to be transcoded before telling the user "Upload Complete." The user’s browser connection would timeout, and your upload servers would run out of memory trying to hold onto open connections.
With the Queue: The moment the file lands in S3, the user gets a "Success! Your video is processing" message. The queue holds the processing request safely until a worker is free to pick it up.
2. Absorbing Traffic Spikes (Load Leveling)
Imagine a famous creator uploads a video, and suddenly 10,000 other creators upload videos at the exact same minute.
The Queue absorbs this massive spike. It acts as a buffer.
Your Transcoding Workers don't crash from being overwhelmed; they simply pull jobs from the queue at a steady, manageable pace (e.g., handling 100 videos at a time). The remaining 9,900 jobs sit safely in the queue until workers become available.
3. Parallel Processing (The Worker Split)
A single worker shouldn't transcode a video into 360p, then wait and do 720p, then wait and do 1080p. That is too slow.
Because of the queue architecture, you can design your system so that when a raw video notification lands in the queue, three separate worker processes can grab a copy of the task simultaneously.
Worker A generates the 360p version, Worker B handles 720p, and Worker C handles 1080p in parallel, drastically reducing the time the user spends waiting for their video to "process."
4. Cost Efficiency & Speed at the Edge (S3 ──► CDN ──► Viewer)
Once the workers finish generating the different resolutions, they save the optimized formats (like HLS or DASH stream fragments) back into a secondary, public-facing Object Storage bucket.
You never want global viewers streaming video files directly from an S3 bucket. If 1 million people watch a video straight from S3, your cloud bill will skyrocket and the video will constantly buffer.
Instead, a CDN (Content Delivery Network) sits in front of S3. The CDN caches the 360p, 720p, and 1080p files at edge servers located all over the world (close to the viewers). When a Viewer hits play, they pull the video segments directly from a local CDN cache at ultra-fast speeds.



ProblemComponent/pattern you should immediately think about
Too many reads Cache + read replicas
Too many writes Partition/shard DB + async writes
Traffic spikes Load balancer + autoscaling + queue
Slow expensive work Queue + workers
Huge images/videos S3 + CDN
Real-time communication WebSockets
Millions of events Kafka
Limited inventory locking + atomic transactions
Duplicate requests idempotency key
Database too large sharding
Search Elasticsearch/OpenSearch
Nearby objects geospatial index / geohash
Global users CDN + multi-region
Service failures timeouts + retries + circuit breakers
Downstream overload rate limiting + backpressure
System visibilitylogs + metrics + traces











for an interview on system design, give me all the common components used to build a scalable software system and brief description of what they are used for and what they're meant for
For a system design interview, think of a scalable system as a set of common building blocks. You usually won't use every component, but you should know what each does, why you'd add it, and when it becomes necessary.

Component	What it does / why it's used
Client	Web, mobile, desktop, or another service that sends requests to your system.
DNS	Converts a domain such as api.example.com into the IP/address of your infrastructure.
CDN	Caches static or semi-static content close to users geographically, reducing latency and origin traffic. Examples: CloudFront, Cloudflare.
Edge Network	Runs routing, caching, filtering, authentication, or lightweight computation near users before requests reach your backend.
WAF — Web Application Firewall	Blocks malicious web traffic such as SQL injection, bots, scanners, and suspicious requests.
Load Balancer	Distributes requests across multiple application servers so no single server becomes overloaded.
Reverse Proxy	Sits in front of backend services and handles routing, TLS termination, caching, compression, etc. Nginx is common.
API Gateway	Central entry point for APIs. Handles routing, authentication, rate limiting, quotas, versioning, logging, etc.
Rate Limiter	Restricts how many requests a client/user can make over a period. Protects against abuse and overload.
Application Server	Runs your actual business logic. Usually horizontally scaled across many instances.
Stateless Service	Server that keeps no important user state locally, making it easy to add/remove instances. Preferred for scalable APIs.
Stateful Service	Keeps persistent state locally or tied to a specific instance. Requires more careful scaling and failover.
Microservice	Independently deployable service responsible for a business capability such as users, payments, or orders.
Monolith	Application where many features live in one deployable application. Simpler initially, but may become harder to scale organizationally.
Service Discovery	Allows services to dynamically locate other service instances instead of relying on hard-coded addresses.
Service Mesh	Infrastructure layer controlling service-to-service networking, retries, TLS, observability, traffic policies, etc. Examples: Istio, Linkerd.
Database	Persistent source of truth for application data.
Relational Database / SQL	Structured data with relationships, transactions, and strong consistency. PostgreSQL/MySQL.
NoSQL Database	Optimized for flexible schemas, high throughput, large scale, or specialized access patterns. DynamoDB, MongoDB, Cassandra.
Document Database	Stores JSON-like documents. Useful when data structure varies or maps naturally to objects.
Key-Value Store	Extremely fast lookup by key. Common for caching, sessions, counters, and simple high-scale data.
Wide-Column Database	Designed for enormous horizontally distributed datasets and high write throughput. Cassandra/ScyllaDB.
Graph Database	Stores relationships as nodes and edges. Useful for social networks, recommendations, fraud graphs, etc.
Time-Series Database	Optimized for timestamped measurements such as monitoring metrics, IoT, and financial data.
Search Engine	Provides full-text search, indexing, filtering, and ranking. Elasticsearch/OpenSearch/Solr.
Vector Database	Stores embeddings and retrieves similar vectors. Used for semantic search, recommendation, and RAG/AI systems.
Database Index	Additional data structure that speeds reads at the cost of storage and slower writes.
Read Replica	Copy of a database used primarily for reads, reducing load on the primary database.
Primary/Replica Architecture	Primary handles writes; replicas copy its data and commonly serve reads/failover.
Database Sharding	Splits data across multiple database servers so datasets and traffic can scale beyond one machine.
Partitioning	Divides data into subsets, usually by key, range, geography, or time.
Replication	Maintains multiple copies of data for availability, durability, and sometimes read scalability.
Cache	Stores frequently accessed data in faster storage to reduce database/backend load and latency. Redis/Memcached.
Distributed Cache	Cache shared across many application instances rather than local to one server.
Local/In-Memory Cache	Data stored directly in application memory. Extremely fast but not shared across instances.
Cache Eviction Policy	Determines what gets removed when cache fills, e.g. LRU, LFU, TTL.
Message Queue	Buffers asynchronous jobs so producers don't have to wait for consumers. SQS, RabbitMQ.
Message Broker	Middleware responsible for routing and delivering messages between producers and consumers.
Event Bus	Allows components to publish events that multiple subscribers can independently consume.
Event Stream / Log	Persistent ordered sequence of events optimized for high-throughput event processing. Kafka/Kinesis/Pulsar.
Producer	Service that writes events/messages into a queue or stream.
Consumer / Worker	Background process that reads messages and performs asynchronous work.
Dead-Letter Queue — DLQ	Stores messages that repeatedly fail processing so they can be inspected or retried later.
Job Scheduler	Executes work at specific times or intervals. Cron, Quartz, EventBridge Scheduler.
Background Worker	Performs expensive/non-user-facing tasks asynchronously such as emails, image processing, or report generation.
Object Storage	Stores large blobs such as images, videos, backups, and files. S3/GCS/Azure Blob.
File Storage	Provides filesystem-like persistent storage. EFS/NFS.
Data Warehouse	Stores large historical datasets optimized for analytics instead of transactional workloads. Snowflake, BigQuery, Redshift.
Data Lake	Cheap storage for large amounts of structured and unstructured raw data. Often built on object storage.
ETL / ELT Pipeline	Moves and transforms operational data into analytical systems.
Authentication Service	Determines who the user is. Passwords, OAuth, OIDC, SSO, tokens.
Authorization Service	Determines what the user is allowed to do. RBAC, ABAC, permissions.
Session Store	Stores user login/session state, often in Redis or a database.
Secrets Manager	Securely stores credentials, API keys, database passwords, encryption keys, etc.
KMS — Key Management Service	Generates and manages encryption keys.
TLS/SSL	Encrypts data traveling across networks.
Container	Packages an application and dependencies into an isolated runtime. Docker.
Container Orchestrator	Deploys, restarts, scales, and manages containers across many machines. Kubernetes/ECS.
Virtual Machine	Virtualized server running an operating system. EC2, Compute Engine.
Serverless Function	Executes code on demand without managing servers. Lambda, Cloud Functions.
Autoscaler	Automatically increases/decreases application capacity based on traffic or resource usage.
Horizontal Scaling	Adds more machines/instances. Usually the preferred scaling strategy.
Vertical Scaling	Gives one machine more CPU, RAM, or disk. Easy but has an upper limit.
Health Check	Determines whether an instance is healthy enough to receive traffic.
Heartbeat	Periodic signal showing that a service/node is still alive.
Failover	Automatically moves traffic/work to a healthy backup when a component fails.
Multi-AZ Deployment	Runs infrastructure across multiple availability zones to survive data-center failures.
Multi-Region Deployment	Runs infrastructure geographically across regions for disaster recovery, global latency, or extreme availability.
Circuit Breaker	Stops repeatedly calling an unhealthy downstream service to prevent cascading failures.
Retry	Re-attempts transient failures. Usually combined with exponential backoff and jitter.
Exponential Backoff	Gradually increases delay between retries so recovering services aren't overwhelmed.
Timeout	Stops waiting for a downstream dependency after a bounded period. Essential for preventing resource exhaustion.
Bulkhead	Isolates resources so failure or overload in one subsystem doesn't consume everything.
Idempotency	Ensures retrying the same request doesn't accidentally perform the operation multiple times. Critical for payments/orders.
Distributed Lock	Ensures only one distributed process performs a critical operation at a time. Redis/ZooKeeper/etc.
Leader Election	Selects one node to coordinate work among multiple distributed instances.
Consensus System	Allows distributed machines to agree on shared state despite failures. Raft/Paxos.
Coordination Service	Provides leader election, configuration, locks, membership, etc. ZooKeeper/etcd.
Config Service	Centrally manages application configuration across environments and services.
Feature Flag System	Enables/disables functionality dynamically without redeploying code.
Logging	Records application events and errors for debugging and auditing.
Metrics	Numerical measurements such as request rate, latency, CPU, error rate, and queue depth.
Tracing	Tracks a request across multiple distributed services.
Distributed Tracing	Correlates spans across microservices to identify where latency/errors occur. OpenTelemetry/Jaeger.
Monitoring	Watches infrastructure and application health.
Alerting	Notifies engineers when metrics or failures cross meaningful thresholds.
Observability Platform	Combines logs, metrics, traces, dashboards, and alerts. Datadog/New Relic/Grafana.
Audit Log	Immutable-ish record of important actions, especially security/account/admin operations.
CI/CD Pipeline	Automatically builds, tests, and deploys software.
Container Registry	Stores built container images. ECR, Docker Hub, GCR.
Infrastructure as Code	Defines infrastructure in code so environments are reproducible. Terraform/CloudFormation.
Blue-Green Deployment	Maintains old and new environments and switches traffic between them.
Canary Deployment	Sends a small percentage of traffic to a new version before full rollout.
Rolling Deployment	Gradually replaces old instances with new ones.
Database Migration System	Safely changes database schemas across application versions.
Backup System	Periodically saves persistent data so it can be restored after corruption/failure.
Disaster Recovery	Processes/infrastructure for recovering after catastrophic outages.
API	Defined interface through which clients/services communicate. REST, GraphQL, RPC, etc.
REST	HTTP/resource-oriented API style; simple, ubiquitous, good for public APIs.
GraphQL	Lets clients request exactly the fields they need. Useful for complex frontend data requirements.
RPC / gRPC	Calls remote service methods as if they were functions; efficient for service-to-service communication.
WebSocket	Persistent bidirectional connection. Useful for chat, collaboration, gaming, live dashboards.
Server-Sent Events	Server continuously pushes updates to the browser over one HTTP connection. Simpler than WebSockets for one-way streaming.
Long Polling	Client keeps an HTTP request open until the server has an update. Older/simple approach to real-time communication.
The components that come up most often in interviews
If you're short on study time, prioritize these:

Load balancer → distribute traffic.
Stateless application servers → horizontally scale compute.
SQL vs NoSQL databases → choose appropriate persistence.
Indexes → improve database read performance.
Replication / read replicas → availability + read scalability.
Sharding / partitioning → scale databases horizontally.
Redis/cache → lower latency and database load.
CDN → cache content geographically near users.
Message queue → asynchronous processing.
Kafka/event streaming → high-volume distributed event processing.
Object storage → images, videos, files.
Search engine → full-text/search workloads.
API gateway → centralized API routing/security/rate limiting.
Rate limiter → protect services from excessive traffic.
Workers → process background jobs.
Retries + timeout + circuit breaker → distributed-system resilience.
Monitoring/logging/tracing → production observability.
Autoscaling → dynamically adjust capacity.
Multi-AZ / replication → high availability.
Consistent hashing → distribute cache/shard keys while minimizing remapping.
A common scalable architecture to keep in your head
                  Users
                    │
                    ▼
                   DNS
                    │
                    ▼
              CDN / Edge / WAF
                    │
                    ▼
              Load Balancer
                    │
                    ▼
               API Gateway
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
    App Server            App Server
          │                   │
          └─────────┬─────────┘
                    │
        ┌───────────┼──────────────┐
        │           │              │
        ▼           ▼              ▼
      Redis      Database      Message Queue
      Cache          │              │
                     │              ▼
               Read Replicas     Workers
                     │              │
                     │              ▼
                     │        External Services
                     │
             ┌───────┴───────┐
             ▼               ▼
        Object Storage     Search
The key interview mindset is not merely saying "I'll add Redis/Kafka/Kubernetes." Explain the problem each component solves. For example:

"Reads are overwhelming the primary database, so I'd first add caching for hot objects and read replicas for queries that can tolerate replica lag."

That type of requirement → bottleneck → architectural component → tradeoff reasoning is what system-design interviewers are usually evaluating.

give me 10 more scalable architecture diagrams  like the one above with usecase prompt  to prepare for interview in an hour
Below are 10 high-yield system design interview architectures. These cover most patterns you are likely to encounter.

1. URL Shortener
Prompt:

Design a scalable URL-shortening service like Bitly.

             Users
               │
               ▼
          Load Balancer
               │
               ▼
          API Servers
          /          \
         /            \
        ▼              ▼
     Redis           Database
     Cache         URL Mappings
                       │
                       ▼
                 ID Generator
Core flow:

POST /shorten creates shortCode -> longURL
GET /abc123 redirects to original URL
Cache popular mappings in Redis
Database is source of truth
Generate unique IDs using Snowflake/counter/random Base62
Main scalability topics: caching, ID generation, read-heavy traffic, database sharding.

2. Twitter / X News Feed
Prompt:

Design a scalable social-media feed where users can post and follow other users.

                    Users
                      │
                      ▼
                Load Balancer
                      │
                      ▼
                  API Gateway
                      │
          ┌───────────┼──────────┐
          ▼           ▼          ▼
      User Service Post Service Follow Service
          │           │          │
          ▼           ▼          ▼
       User DB      Post DB    Graph/Follow DB
                      │
                      ▼
                  Event Bus
                    Kafka
                      │
                      ▼
               Feed Workers
                      │
                      ▼
                 Feed Cache
                   Redis
                      │
                      ▼
                Feed Service
Core idea: fan-out on write.

When someone posts:

Post
 │
 ▼
Kafka
 │
 ▼
Feed Workers
 │
 ├── add post to follower A feed
 ├── add post to follower B feed
 └── add post to follower C feed
For celebrities with millions of followers, use fan-out on read or a hybrid.

Main topics: Kafka, caching, denormalization, fan-out, celebrity problem.

3. Instagram / Image Sharing
Prompt:

Design Instagram where users upload images and browse feeds.

                    Users
                      │
                      ▼
                     CDN
                      │
                      ▼
                Load Balancer
                      │
                      ▼
                 API Servers
                 /         \
                ▼           ▼
           Metadata DB    Object Storage
                          S3
                            │
                            ▼
                           CDN

Upload:
User
 │
 ▼
API
 │
 ▼
S3
 │
 ▼
Queue
 │
 ▼
Image Workers
 │
 ├── thumbnails
 ├── compression
 └── moderation
Store only metadata in DB:

Post
- post_id
- user_id
- image_url
- caption
- created_at
Images themselves go into object storage, not SQL.

Main topics: CDN, S3, async image processing, metadata database, presigned uploads.

4. YouTube / Video Streaming
Prompt:

Design a scalable video-upload and streaming platform.

                       User
                        │
                        ▼
                  Upload Service
                        │
                        ▼
                  Object Storage
                        │
                        ▼
                     Queue
                        │
                        ▼
              Transcoding Workers
              /       |        \
             ▼        ▼         ▼
           360p      720p      1080p
             \        |         /
              └───────┼────────┘
                      ▼
                Object Storage
                      │
                      ▼
                     CDN
                      │
                      ▼
                    Viewer
Separate metadata:

API
 │
 ▼
Metadata DB
 │
 ├── title
 ├── description
 ├── uploader
 └── video locations
Main topics: asynchronous processing, CDN, object storage, transcoding, chunked video/HLS.

5. WhatsApp / Real-Time Chat
Prompt:

Design a real-time messaging application supporting millions of concurrent users.

                User A
                  │
             WebSocket
                  │
                  ▼
           Gateway Servers
                  │
                  ▼
            Chat Service
             /        \
            ▼          ▼
        Message DB   Redis
                     Presence
                       │
                       ▼
                    Kafka
                       │
                       ▼
                Delivery Workers
                       │
                       ▼
                Gateway Server
                       │
                  WebSocket
                       │
                       ▼
                    User B
If B is offline:

Message
   │
   ▼
Message DB
   │
   ▼
Push Notification Service
   │
   ▼
APNs / FCM
Main topics: WebSockets, connection management, message ordering, delivery/read receipts, presence, Kafka.

6. Uber / Lyft
Prompt:

Design a ride-sharing system that matches riders with nearby drivers.

                Rider App
                    │
                    ▼
                API Gateway
                    │
                    ▼
              Ride Service
                    │
                    ▼
             Matching Service
                    │
           ┌────────┴─────────┐
           ▼                  ▼
      Redis / Geo Index    Driver Service
           │                  │
           ▼                  ▼
     Nearby Drivers       Driver DB

Driver App
    │
    ▼
Location Gateway
    │
    ▼
Kafka / Stream
    │
    ▼
Location Service
    │
    ▼
Redis Geo Index
Driver locations update continuously.

Typical geo options:

Geohash
H3
S2
Redis GEO
Main topics: geospatial indexing, real-time events, WebSockets, eventual consistency, high write throughput.

7. Amazon / E-Commerce Checkout
Prompt:

Design an e-commerce platform that supports browsing, carts, inventory, and checkout.

                       User
                        │
                        ▼
                    API Gateway
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
      Catalog        Cart Service   Order Service
      Service            │              │
          │               ▼              ▼
          ▼             Redis         Order DB
      Product DB                         │
                                        ▼
                                 Inventory Service
                                        │
                                        ▼
                                 Payment Service
                                        │
                                        ▼
                                   Payment API
Order events:

Order Created
     │
     ▼
    Kafka
     │
 ┌───┼──────────┐
 ▼   ▼          ▼
Email Inventory Shipping
Critical flow:

Inventory reserve
      ↓
Payment
      ↓
Create order
      ↓
Confirm inventory
Use Saga pattern for distributed transactions.

Main topics: transactions, idempotency, inventory race conditions, Saga, queues.

8. Ticketmaster / Flash-Sale Ticketing
Very relevant to your TicketSocket experience.

Prompt:

Design a ticketing system where millions of users may try to purchase limited inventory simultaneously.

                     Millions of Users
                            │
                            ▼
                          CDN
                            │
                            ▼
                     Waiting Room
                            │
                            ▼
                       Rate Limiter
                            │
                            ▼
                      Load Balancer
                            │
                            ▼
                      Ticket API
                            │
                ┌───────────┴──────────┐
                ▼                      ▼
             Redis                 Ticket DB
        Availability Cache       Source of Truth
                │
                ▼
          Reservation Service
                │
                ▼
           Distributed Lock
                │
                ▼
           Checkout Service
                │
                ▼
          Payment Provider
Reservation model:

AVAILABLE
   │
   ▼
HELD for 5 minutes
   │
 ┌─┴─────┐
 ▼       ▼
SOLD   AVAILABLE
Avoid overselling using:

atomic DB updates
optimistic locking
distributed locks
reservation expiration
Main topics: extreme bursts, concurrency, rate limiting, queues, locking, idempotency.

9. Google Drive / Dropbox
Prompt:

Design a distributed file-storage and synchronization service.

                    Client
                      │
                      ▼
                API Gateway
                      │
            ┌─────────┴──────────┐
            ▼                    ▼
      Metadata Service       Upload Service
            │                    │
            ▼                    ▼
        Metadata DB          Chunk Service
                                 │
                                 ▼
                           Object Storage
                                 │
                                 ▼
                            Replication

File Changed
     │
     ▼
Event Bus
     │
     ▼
Sync Service
     │
     ▼
Other Devices
Large files get chunked:

File
 │
 ├── Chunk 1
 ├── Chunk 2
 ├── Chunk 3
 └── Chunk 4
Hash chunks to enable deduplication.

Main topics: chunking, synchronization, versioning, deduplication, conflict resolution.

10. Search Engine / Elasticsearch-Style Search
Prompt:

Design a search system supporting millions of documents and low-latency queries.

                   Data Producers
                        │
                        ▼
                      Kafka
                        │
                        ▼
                  Index Workers
                        │
                        ▼
                Search Index Cluster
              ┌─────────┼─────────┐
              ▼         ▼         ▼
           Shard 1    Shard 2   Shard 3
              │         │         │
              └─────────┼─────────┘
                        ▼
                 Search Service
                        │
                        ▼
                     Redis
                     Cache
                        │
                        ▼
                      User
Query:

"senior software engineer"
          │
          ▼
      Coordinator
          │
   ┌──────┼──────┐
   ▼      ▼      ▼
Shard1  Shard2  Shard3
   │      │      │
   └──────┼──────┘
          ▼
        Merge
          │
          ▼
       Rank Top K
Main topics: inverted indexes, partitioning/sharding, ranking, caching, eventual indexing consistency.

Bonus: Notification System
This is another extremely common interview question.

Prompt:

Design a notification service capable of delivering email, SMS, and push notifications at large scale.

             Application Services
                     │
                     ▼
              Notification API
                     │
                     ▼
                   Kafka
                     │
          ┌──────────┼───────────┐
          ▼          ▼           ▼
      Email Queue  SMS Queue   Push Queue
          │          │           │
          ▼          ▼           ▼
       Workers     Workers      Workers
          │          │           │
          ▼          ▼           ▼
       SendGrid    Twilio      APNs / FCM
Add:

Redis
  │
  ├── rate limits
  ├── deduplication
  └── user preferences

DLQ
 │
 └── failed notifications
The pattern you should recognize in almost every interview
Most scalable systems eventually resemble this:

                         Users
                           │
                           ▼
                    DNS / CDN / WAF
                           │
                           ▼
                     Load Balancer
                           │
                           ▼
                      API Gateway
                           │
                ┌──────────┼───────────┐
                │          │           │
                ▼          ▼           ▼
            Service A   Service B   Service C
                │          │           │
                └──────┬───┴───────────┘
                       │
          ┌────────────┼─────────────┐
          ▼            ▼             ▼
        Redis       Database       Kafka
        Cache          │             │
                       │             ▼
                 Read Replicas     Workers
                       │             │
                       │             ▼
                 Search/S3     External APIs
The interviewer then changes which part is difficult.

Problem	Component/pattern you should immediately think about
Too many reads	Cache + read replicas
Too many writes	Partition/shard DB + async writes
Traffic spikes	Load balancer + autoscaling + queue
Slow expensive work	Queue + workers
Huge images/videos	S3 + CDN
Real-time communication	WebSockets
Millions of events	Kafka
Limited inventory	locking + atomic transactions
Duplicate requests	idempotency key
Database too large	sharding
Search	Elasticsearch/OpenSearch
Nearby objects	geospatial index / geohash
Global users	CDN + multi-region
Service failures	timeouts + retries + circuit breakers
Downstream overload	rate limiting + backpressure
System visibility	logs + metrics + traces
For your interview in one hour, memorize this sequence
When they say:

"Design X."

Walk through this exact process:

1. Clarify requirements
        ↓
2. Estimate scale
        ↓
3. Define APIs
        ↓
4. Define data model
        ↓
5. Draw high-level architecture
        ↓
6. Identify bottlenecks
        ↓
7. Add scaling mechanisms
        ↓
8. Discuss failures + consistency
        ↓
9. Discuss tradeoffs
And think:

CLIENT
  ↓
LOAD BALANCER
  ↓
STATELESS SERVICES
  ↓
 ┌───────────┬───────────┐
 ▼           ▼           ▼
CACHE       DB          QUEUE
             │           │
             ▼           ▼
         REPLICAS      WORKERS

+ CDN if large/static content
+ S3 if files
+ Kafka if events
+ WebSocket if realtime
+ Search engine if search
+ Sharding if DB becomes huge
If you can confidently draw and explain the 10 architectures above, you will have seen the core architecture behind a very large percentage of system-design interview questions.

sql vs nosql use cases, indexes use cases (and are these their own server or index in database?) what are some examples of Kafka/event streaming (is pub/sub ? if so how to determine topics/groups)
Yes—these are exactly the distinctions interviewers often probe.

1. SQL vs. NoSQL — when to use each
SQL — PostgreSQL, MySQL, SQL Server
Think:

Relationships + transactions + consistency

Use SQL when data has clear relationships and correctness matters.

Users
  │
  ├── Orders
  │     └── OrderItems
  │
  └── Payments
Good use cases:

Use case	Why SQL
Payments	ACID transactions
Banking	Strong consistency
Orders / checkout	Transactions across related records
Inventory	Prevent overselling
User/account systems	Structured relationships
SaaS/business applications	Lots of relational data
Ticket reservations	Atomic inventory updates
Reporting requiring JOINs	Relational querying
Example:

users
orders
order_items
payments

You can easily ask:

SELECT *
FROM orders
JOIN users ON orders.user_id = users.id
WHERE users.id = 123;

NoSQL — MongoDB, DynamoDB, Cassandra
Think:

Massive scale + simple access patterns + flexible data model

Good use cases:

Use case	Typical choice
User sessions	Redis / DynamoDB
Product catalog	MongoDB / DynamoDB
Activity/event data	Cassandra
IoT data	Cassandra / DynamoDB
Huge key-value lookup workload	DynamoDB
Flexible JSON documents	MongoDB
Very high write throughput	Cassandra
Feed/timeline storage	Cassandra/DynamoDB
Example document:

{
  "userId": 123,
  "name": "Oscar",
  "preferences": {
    "theme": "dark",
    "notifications": true
  }
}

No joins required.

Interview shortcut
Ask yourself:

Do I need:
transactions?
relationships?
joins?
strict consistency?

YES
 ↓
SQL

Do I primarily need:
huge horizontal scale?
very high throughput?
key-based lookups?
flexible schema?

YES
 ↓
NoSQL
But don't say:

"SQL doesn't scale."

That's generally wrong.

PostgreSQL/MySQL can scale very far with:

indexes
caching
read replicas
partitioning
sharding
A strong interview answer is:

"I'd start with PostgreSQL unless the access patterns or scale give me a concrete reason to choose a specialized NoSQL database."

2. Database indexes
An index normally lives inside the database, not on its own server.

Suppose you have:

users
--------------------------------
id
email
name
created_at
country
And frequently execute:

SELECT *
FROM users
WHERE email = 'a@example.com';

Without an index:

Scan row 1
Scan row 2
Scan row 3
...
Scan row 100,000,000
Potentially O(n).

Create:

CREATE INDEX idx_users_email
ON users(email);

The DB maintains a separate data structure roughly like:

              [M]
             /   \
          [F]     [T]
         /  \     / \
        A    H   P   Z
Typically a B-tree/B+ tree.

Then:

email
  ↓
index
  ↓
location of row
  ↓
actual row
Much faster lookup—roughly logarithmic rather than scanning the whole table.

Common index use cases
Exact lookup
WHERE email = ?

Index:

email
Range queries
WHERE created_at
BETWEEN X AND Y

Index:

created_at
B-tree indexes are especially useful here.

Sorting
ORDER BY created_at DESC

An appropriate index can avoid an expensive sort.

JOINs
orders.user_id = users.id

Index foreign/reference columns frequently used in joins:

orders.user_id
Composite indexes
Suppose this is common:

SELECT *
FROM orders
WHERE user_id = ?
AND status = ?
ORDER BY created_at DESC;

You might create:

(user_id, status, created_at)
Important interview point:

Index column order matters.

For:

(user_id, status, created_at)
it is particularly useful for queries beginning with:

user_id
user_id + status
user_id + status + created_at
This is often called the leftmost-prefix principle.

3. Why not index everything?
Because indexes accelerate reads but add cost to writes.

INSERT order

        │
        ├── update table
        ├── update index A
        ├── update index B
        └── update index C
Indexes consume:

storage
RAM/cache
additional INSERT work
additional UPDATE work
additional DELETE work
So:

Index columns based on actual query/access patterns.

4. Is Elasticsearch/OpenSearch also an "index"?
Yes, but this is a different concept.

Database index
PostgreSQL
   │
   ├── Table
   ├── B-tree index
   └── Hash/etc index
Part of the database.

Search index
PostgreSQL
     │
     │ events / CDC
     ▼
Elasticsearch
     │
     ▼
Inverted Search Index
Elasticsearch/OpenSearch is typically a separate distributed service/cluster.

It's designed for:

"find documents containing:
senior software engineer AWS"
rather than normal relational lookup.

Its inverted index is conceptually:

software → docs 1, 5, 7, 10
engineer → docs 1, 2, 7
AWS      → docs 1, 8, 9
So:

DB index
→ optimize DB queries

Search index
→ optimize full-text/search/ranking
5. Kafka / event streaming
Kafka is an event-streaming platform.

And yes, it supports a publish/subscribe-style architecture, but its model is somewhat richer than a simple pub/sub system.

Basic idea:

Producer
   │
   │ publish
   ▼
 Kafka Topic
   │
   ├──── Consumer A
   ├──── Consumer B
   └──── Consumer C
Example:

Order Service
      │
      │ OrderCreated
      ▼
orders topic
      │
      ├── Inventory Service
      ├── Email Service
      ├── Analytics Service
      └── Fraud Service
Each independently reacts to the same event.

6. Real Kafka example
Imagine Amazon checkout:

               Order Service
                     │
                     │
               OrderCreated
                     ▼
               Kafka: orders
                     │
        ┌────────────┼─────────────┐
        ▼            ▼             ▼
   Inventory       Email        Analytics
    Service       Service        Service
Another topic:

Payment Service
      │
      │ PaymentCompleted
      ▼
Kafka: payments
      │
      ├── Order Service
      ├── Accounting
      ├── Fraud Detection
      └── Analytics
Another:

Shipment Service
      │
      ▼
Kafka: shipments
      │
      ├── Notifications
      ├── Tracking
      └── Analytics
So topics commonly represent streams of related domain events.

7. How do I determine Kafka topics?
Think:

What category/domain of events forms a useful independent stream?

Good:

orders
payments
shipments
user-events
inventory-events
Potential events within orders:

OrderCreated
OrderCancelled
OrderShipped
OrderCompleted
You don't necessarily need:

order-created-topic
order-cancelled-topic
order-shipped-topic
That can create excessive topic proliferation.

Instead:

orders
   │
   ├── OrderCreated
   ├── OrderCancelled
   └── OrderUpdated
and consumers inspect event type.

Topic boundaries are generally driven by:

domain ownership
retention requirements
throughput
permissions/security
ordering requirements
consumer patterns
8. Kafka partitions
A topic is divided into partitions for scalability.

                 orders topic

         ┌──────────┬──────────┬──────────┐
         ▼          ▼          ▼
     Partition 0 Partition 1 Partition 2

       Broker A    Broker B    Broker C
This allows multiple brokers and consumers to process events concurrently.

9. How do you choose the partition key?
This is one of the most important Kafka interview concepts.

Suppose events are:

OrderCreated
OrderUpdated
OrderCancelled
You probably need events for one order to stay ordered.

Use:

key = orderId
Kafka hashes:

hash(orderId)
      │
      ▼
partition
Therefore:

order 123 Created
order 123 Updated
order 123 Cancelled
all reach:

Partition 2
and preserve ordering.

Other examples:

User events
key = userId

Payment events
key = paymentId

Account transactions
key = accountId

Device events
key = deviceId
The rule:

Pick a partition key corresponding to the entity for which ordering matters.

10. What is a consumer group?
This is critical.

Suppose you have:

orders topic

P0
P1
P2
P3
Inventory Service needs to process all orders.

Instead of one server:

Inventory Consumer
you run four:

Consumer Group: inventory

Consumer 1 ← P0
Consumer 2 ← P1
Consumer 3 ← P2
Consumer 4 ← P3
Now work is parallelized.

Consumers within the SAME group
They share the workload.

               Topic
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
       P0        P1        P2
       │         │         │
       ▼         ▼         ▼
 Consumer 1 Consumer 2 Consumer 3

     inventory-service group
Each event is handled by one consumer in that group.

11. Different consumer groups = pub/sub
Now consider:

orders
  │
  ├── Inventory Group
  ├── Analytics Group
  └── Email Group
Each group receives the entire stream independently.

                     orders
                       │
        ┌──────────────┼─────────────┐
        ▼              ▼             ▼
Inventory Group   Email Group   Analytics Group

C1 C2 C3          C1 C2          C1 C2 C3
That's how Kafka combines:

Queue behavior
Inside one consumer group:

Consumers divide work.
Pub/sub behavior
Across different consumer groups:

Every group independently gets the events.
This distinction is worth memorizing.

12. Topic vs partition vs consumer group
Use this mental model:

TOPIC
"What type of events are these?"

orders


PARTITION
"How do we horizontally scale and preserve
ordering for an entity?"

orders P0
orders P1
orders P2


CONSUMER GROUP
"What independent application/job
needs to process these events?"

inventory-service
email-service
analytics-service
13. Example interview architecture
Suppose interviewer says:

Design an e-commerce order-processing system.

You might draw:

                       User
                        │
                        ▼
                   Order API
                        │
                        ▼
                   PostgreSQL
                        │
                   OrderCreated
                        ▼
                  Kafka: orders
                        │
          ┌─────────────┼───────────────┐
          │             │               │
          ▼             ▼               ▼
     Inventory       Payment        Analytics
       Group           Group           Group
          │             │
          ▼             ▼
     Inventory DB   Payment API
Partition:

Kafka topic: orders

key = orderId

        hash(orderId)
             │
      ┌──────┼──────┐
      ▼      ▼      ▼
     P0     P1      P2
Scale inventory processing:

Consumer Group: inventory

P0 → inventory-worker-1
P1 → inventory-worker-2
P2 → inventory-worker-3
14. Kafka vs normal message queue
This is also likely to come up.

Kafka	SQS/RabbitMQ-style queue
Main abstraction	Event log/stream	Message queue
Message retained after read?	Yes	Usually consumed/deleted
Replay old events?	Yes	Usually not the primary model
Multiple independent consumers	Excellent	Possible, but different model
Huge throughput	Excellent	Good
Ordering	Per partition	Depends on queue/type
Event sourcing/analytics	Excellent	Less suited
Background jobs	Can work	Often simpler/better
Example:

Queue
User uploads image
       │
       ▼
      SQS
       │
       ▼
Image Processor
You just need the job processed.

Kafka
OrderPlaced
    │
    ▼
 Kafka
    │
    ├── Inventory
    ├── Fraud
    ├── Analytics
    ├── Notifications
    └── Data Warehouse
Many systems need to independently react, and you may want to replay history.

Interview cheat sheet
Memorize these four statements:

SQL

"I choose SQL when relational integrity, transactions, joins, and strong consistency are important."

NoSQL

"I choose NoSQL when the access patterns are simple and I need massive horizontal scalability, high throughput, or a flexible data model."

Indexes

"Indexes are usually data structures maintained inside the database that trade additional storage and write overhead for much faster reads."

Kafka

"Kafka stores ordered event streams in topics. Topics are split into partitions for horizontal scale, a partition key preserves ordering for an entity, consumers within a group divide the work, and separate consumer groups independently receive the stream."

That last sentence alone covers topics + partitions + keys + consumer groups + pub/sub very well in a system-design interview.

what is cassandra and wide column db
Cassandra is a distributed NoSQL wide-column database designed for huge scale, high write throughput, and high availability.

A wide-column database stores data in rows, but unlike a traditional SQL table, each row can have a flexible set of columns and is physically organized around a partition key and clustering columns.

Think of it like this:

SQL table
--------------------------------
user_id | name | email | age
1       | Bob  | ...   | 30
2       | Sue  | ...   | 25
Cassandra is closer to:

Partition: user_123

timestamp       event_type      data
------------------------------------------
10:00:01        login           ...
10:01:12        page_view       ...
10:02:45        purchase        ...
10:05:20        logout          ...
The key idea is that Cassandra is optimized around known access patterns, not arbitrary joins.

Why use Cassandra?
It's especially good when you have:

massive write volume
data spread across many servers
very large datasets
high availability requirements
predictable queries by key
time-series/event-style data
Common examples:

IoT sensor events
clickstream/activity logs
messaging history
user timelines
metrics
telemetry
large event streams
For example:

Millions of devices
       │
       ▼
     Kafka
       │
       ▼
   Cassandra
       │
       ├── Device A events
       ├── Device B events
       └── Device C events
Cassandra distributes partitions automatically across nodes:

                Cassandra Cluster

          ┌────────┬────────┬────────┐
          ▼        ▼        ▼
        Node A   Node B   Node C

user1      ✓        ✓
user2               ✓        ✓
user3      ✓                 ✓
Data is replicated, so if one node dies, other replicas can continue serving requests.

Why is it called "wide-column"?
Because one partition can contain a very large number of related rows/columns, often ordered by a clustering key.

Example schema:

CREATE TABLE user_events (
    user_id UUID,
    timestamp TIMESTAMP,
    event_type TEXT,
    data TEXT,
    PRIMARY KEY (user_id, timestamp)
);

Here:

user_id
   ↓
Partition key
Determines which Cassandra nodes store the data.

timestamp
   ↓
Clustering column
Determines ordering inside that partition.
So querying:

SELECT *
FROM user_events
WHERE user_id = 123;

is extremely efficient because Cassandra knows exactly which partition contains the data.

But doing:

SELECT *
FROM user_events
WHERE event_type = 'purchase';

may be inefficient unless you explicitly designed another table around that query.

This leads to an important Cassandra principle:

Design your tables around your queries.

Unlike SQL:

SQL:
model the relationships
→ query them later

Cassandra:
know the queries first
→ design tables specifically for them
Cassandra vs PostgreSQL
PostgreSQL	Cassandra
Type	Relational	Wide-column NoSQL
JOINs	Excellent	Generally no
Transactions	Strong ACID	Limited compared with SQL
Complex queries	Excellent	Poor fit
Horizontal scaling	Harder	Built-in
Massive writes	Good	Excellent
Multi-node distribution	Added architecture	Core design
Schema design	Normalize data	Often denormalize
Query flexibility	High	Low
Best for	Business/transaction data	Huge distributed workloads
A useful interview example:

E-commerce

Orders + payments + inventory
        ↓
   PostgreSQL

Billions of click events
        ↓
    Cassandra
Cassandra vs MongoDB
MongoDB stores documents:

{
  "user": 123,
  "name": "Bob",
  "orders": [...]
}

Cassandra stores data optimized around partitioned access patterns:

user_id = 123
      │
      ├── event 1
      ├── event 2
      ├── event 3
      └── event 4
So the interview-level summary is:

Cassandra is a distributed wide-column NoSQL database built for extremely high write throughput, horizontal scaling, replication, and availability. It's best when you have massive datasets and predictable key-based access patterns, but it's a poor choice when you need joins, arbitrary querying, or complex transactions.
















How do i explain in an interview how i handled security for users? For example in ticketsocket where we had onboarded clients using our white label software, where they wanted the users from their application to be able to use their same credentials to login to the application branded to their company that was ticketsocket white label software (I remember we used Auth0). Also how would security be handled for merchant payment processors since each merchant had a different payment processor they wanted to use to process tickets through ticket socket event and ticket management software
You can explain this as two different security problems:

End-user identity federation — letting a merchant’s existing users log into the white-label TicketSocket application with the same credentials.
Merchant payment credentials — securely connecting each merchant’s TicketSocket tenant to that merchant’s chosen payment processor.
For the interview, I’d keep those separate because the trust boundaries are different.

At TicketSocket, security had two important tenant-specific concerns: authenticating the merchant's end users into our white-label application, and securely integrating each merchant's own payment processor.

For customer authentication, we used Auth0 as the identity layer. Because TicketSocket was white-labeled, a merchant might already have its own customer identity system and wanted those same users to access the TicketSocket-powered experience without creating another account.

The pattern was identity federation. TicketSocket trusted Auth0, and Auth0 could be configured with the merchant's identity provider using a standard protocol such as OpenID Connect or SAML. From the customer's perspective, they authenticated using the merchant's normal credentials. After successful authentication, Auth0 issued tokens that our application could validate.

The access token contained the authenticated user's identity and relevant claims, and our APIs verified the token's signature, issuer, audience, expiration, and authorization claims before serving protected resources. We also associated the user with the correct merchant or tenant so a user authenticated through one white-label client could not cross tenant boundaries and access another merchant's data.

The backend remained largely stateless for authentication because services could verify signed tokens rather than maintaining a server-side login session for every request. Authorization still happened at the application layer—for example, verifying that the authenticated user was actually allowed to access a particular order or ticket.

Payment integrations were a separate security boundary. Each merchant could use a different processor, such as Square or another provider, so we treated payment credentials as tenant-scoped secrets rather than application-wide configuration.

The merchant configuration identified which payment-provider adapter to use, while credentials or OAuth tokens were stored securely and retrieved only by the payment service when necessary. We would never expose those credentials to the frontend or place them directly in normal application configuration or logs.

The architecture was roughly:

Client → TicketSocket API → Payment Service → Merchant-specific provider adapter → Square/other processor.

The payment service selected the appropriate provider based on the merchant configuration. Provider-specific code was isolated behind a common interface, which gave the rest of TicketSocket one consistent payment API even though the underlying processors differed.

For card security, the preferred model is to let the processor tokenize the card information so TicketSocket handles a payment token rather than storing raw card numbers. That reduces PCI exposure and limits the amount of sensitive payment data inside our system.

Incoming payment webhooks were also treated as untrusted internet traffic. We verified the provider's webhook signature, deduplicated events using the provider event or transaction ID, and processed state changes idempotently so retries couldn't create duplicate charges, refunds, or order transitions.

So the general security model was: federated identity for end users, strict tenant isolation in authorization, securely scoped merchant credentials for payment providers, tokenization for card data, signed webhook verification, and idempotent processing for payment events.

A few details are worth understanding technically so you can answer follow-ups.

1. White-label authentication with Auth0
Suppose TicketSocket hosts:

tickets.merchant-a.com
tickets.merchant-b.com
Merchant A already has:

accounts.merchant-a.com
You don't want:

Merchant A credentials
        ↓
copied into TicketSocket DB
Instead:

                     Merchant A Identity Provider
                    /     OIDC / SAML
                   /
Customer → TicketSocket → Auth0
                             │
                             │ signed tokens
                             ▼
                     TicketSocket APIs
Auth0 acts as the identity broker.

Conceptually:

Merchant A IdP ─┐
Merchant B IdP ─┼──→ Auth0 ───→ TicketSocket
Merchant C IdP ─┘
Each merchant can have its own upstream authentication system while TicketSocket has one normalized authentication model.

That is an excellent architecture pattern to mention:

“We normalized multiple customer identity systems behind Auth0 rather than teaching every TicketSocket service how to authenticate against every merchant's identity provider.”

2. The JWT might contain tenant context
You might conceptually have claims like:

{
  "sub": "user-92831",
  "tenant_id": "merchant-a",
  "aud": "ticketsocket-api",
  "iss": "https://auth.example.com/",
  "exp": 1793424600
}
Then the backend doesn't merely do:

WHERE order.user_id = user123
It should enforce something like:

WHERE
    tenant_id = merchantA
AND user_id = user123
This is multi-tenant isolation.

For a white-label SaaS platform, this is one of the most important security concepts to emphasize.

Authenticated
≠
authorized
Authentication says:

This is user 123.
Authorization says:

User 123 belongs to Merchant A
and is allowed to access Merchant A order 456.
3. Don't claim an exact Auth0 configuration you don't remember
Since you remember Auth0 but may not remember whether each client specifically used Auth0 Connections, Organizations, SAML, OIDC, a custom DB connection, etc., don't overstate it.

A safe interview formulation is:

“We used Auth0 as the identity abstraction for the white-label application. Depending on the client's existing identity system, that could be federated through a standard OIDC/SAML connection. I don't remember the exact connection type used by every merchant, but the architectural goal was that TicketSocket trusted Auth0-issued identity rather than managing each client's credentials ourselves.”

That is better than confidently inventing an implementation detail.

Payment processors: think “tenant-scoped provider adapters”
A clean architecture is:

                         TicketSocket
                              │
                    Checkout / Order API
                              │
                              ▼
                       Payment Service
                              │
                 merchant_id = merchantA
                              │
                              ▼
                     Merchant Config
                              │
                  provider = Square
                              │
                              ▼
                        Secret Manager
                              │
                              ▼
                       Square Adapter
                              │
                              ▼
                         Square API
Another merchant:

merchantB
   ↓
provider = Stripe
   ↓
Stripe Adapter
Another:

merchantC
   ↓
provider = Authorize.Net
   ↓
Authorize.Net Adapter
Application code can expose a common contract:

interface PaymentProvider {
  authorize(...)
  capture(...)
  refund(...)
  void(...)
}
Then:

Payment Service
    │
    ├── SquareProvider
    ├── StripeProvider
    └── OtherProvider
This is basically the Strategy/Adapter pattern, and it is very relevant to your TicketSocket experience.

How credentials should be secured
Not:

merchant table

square_api_key = "secret123"
in plaintext.

Prefer:

Merchant Config DB
provider = square
secret_reference = secret/merchantA/square
                         │
                         ▼
                  Secrets Manager
                         │
                         ├── OAuth access token
                         ├── refresh token
                         └── webhook secret
Encrypt at rest with KMS or equivalent and restrict access so only the payment service's identity can retrieve payment secrets.

That gives:

Frontend                  ✗
Order-history service     ✗
Analytics                 ✗
Payment Service           ✓
This is least privilege.

If the processor supports OAuth
For something like a processor where merchants authorize your platform:

Merchant
   ↓
"Connect Square"
   ↓
Square OAuth
   ↓
authorization code
   ↓
TicketSocket backend
   ↓
access + refresh tokens
   ↓
encrypted secret storage
Then TicketSocket does not need the merchant to manually hand over a password.

And importantly:

Customer password
Merchant payment credentials
Card information
are three completely different secret types with different owners and lifecycle rules.

Card data
A strong interview answer should mention PCI scope.

Ideally:

Browser
   │
   │ card details
   ▼
Square hosted SDK / payment component
   │
   ▼
Square
   │
   │ payment token
   ▼
TicketSocket backend
Rather than:

Browser
   ↓
TicketSocket server
   ↓
store raw card number
The processor tokenizes the card.

TicketSocket sees something like:

payment_method_token = xyz
not:

4111 1111 1111 1111
That significantly limits exposure of cardholder data.

Square webhook security
This connects directly to the high-throughput architecture you've been discussing.

Square
   │
   │ webhook
   ▼
Webhook Endpoint
   │
   ├── verify signature
   ├── validate merchant/provider
   ├── check event ID
   └── enqueue
          │
          ▼
      Kafka/SQS
          │
          ▼
      Consumers
Do not trust:

POST /square/webhook
simply because the payload says:

{
  "payment_status": "COMPLETED"
}
Anyone could POST that.

You need:

payload + Square signature + shared verification secret
                      ↓
                 verification
                      ↓
                     valid?
Only then process it.

And still assume duplicate delivery:

event abc123
event abc123
event abc123
so:

provider_event_id = abc123
becomes an idempotency/deduplication key.

Payment authorization needs multiple layers
For something like:

POST /orders/123/refund
you would want:

JWT valid?
     ↓
user/merchant authorized?
     ↓
does order belong to this tenant?
     ↓
does role allow refund?
     ↓
is refund state transition valid?
     ↓
call payment processor
For an administrative TicketSocket user, you might use RBAC:

cashier
→ sell tickets

manager
→ sell + refund

merchant admin
→ configuration + reporting

TicketSocket support
→ carefully scoped support capabilities
Again:

Authentication proves identity; authorization determines whether that identity can perform this operation on this tenant's resource.

A very strong way to connect both sides in your interview
You can say:

“TicketSocket was multi-tenant in two different dimensions. On the identity side, merchants wanted their customers to experience TicketSocket as part of their own application, so Auth0 gave us an identity federation layer and normalized authentication across white-label clients. On the payment side, every tenant could bring its own processor credentials, so we normalized those integrations behind a payment-provider abstraction while keeping credentials tenant-scoped and encrypted. In both cases, the architectural principle was the same: don't spread vendor-specific trust logic throughout the application—put it behind a controlled boundary and expose a normalized interface to the rest of the platform.”

That last point is particularly strong because it shows you understand the architecture principle, not just Auth0 or Square.

what do you mean by "When the user requests:

tickets.example.com/event/123
the edge layer checks whether they already have a valid admission token."


what is the edge layer exactly? Also what is the admission token and is it different to other tokens? What is a session? How does client application manage the session and what is a cookie? If a user attempts to navigate to a reservation page domain route but they do not have ADMITTED status yet from the waiting room then what actually happens here do they get rerouted and how does this get handled and where client or other component or both?

Yes—this is where several concepts blur together. The cleanest way to understand it is to separate edge routing, authentication, waiting-room admission, and browser session state.

1. What exactly is the “edge layer”?
The edge layer is infrastructure that receives the user's request before it reaches your application servers.

For example:

Browser
   │
   ▼
Cloudflare / CloudFront
   │
   ▼
WAF
   │
   ▼
Load Balancer / API Gateway
   │
   ▼
TicketSocket application
Depending on the architecture, "edge" might include:

CDN
WAF
reverse proxy
load balancer
API Gateway
edge functions / Lambda@Edge / Cloudflare Workers
Its purpose is to make decisions such as:

Is this request malicious?
Is this user rate-limited?
Does this request have a valid admission token?
Should this request go to the waiting room?
Should this request reach the ticketing app?
So when I said:

"the edge layer checks whether they already have a valid admission token"

I meant something like:

Browser
   │
GET /event/123/reserve
   │
   ▼
CloudFront / edge worker / gateway
   │
   ├── admission token valid?
   │
   ├── YES → ticketing application
   │
   └── NO  → waiting room
The advantage is that unauthorized traffic gets stopped before it consumes expensive backend capacity.

2. What is an admission token?
An admission token means:

"The waiting-room system has approved this browser/user to enter this particular ticket sale."

It is not necessarily the same thing as the user's login token.

For example:

Authentication token
=
"this is user 123"

Admission token
=
"user/session 123 is allowed into event 456's ticket-sale flow until 10:30"
Those are two different questions.

You might have:

Auth0 JWT
{
   sub: "user123",
   email: "...",
   roles: ["customer"]
}
and separately:

Admission token
{
   sessionId: "queue-789",
   userId: "user123",
   eventId: "event456",
   status: "ADMITTED",
   admittedAt: 10:15,
   exp: 10:30
}
Then the request might effectively have both:

Who are you?
        ↓
authentication token

Are you allowed into this sale?
        ↓
admission token
The reservation service may require both.

3. Why use an admission token?
Because otherwise the browser could simply claim:

{
  "status": "ADMITTED"
}
and skip the waiting room.

You need something the user cannot forge.

For example the waiting-room service signs:

{
   eventId: 123,
   queueSessionId: abc,
   status: ADMITTED,
   exp: ...
}
using its private signing key.

Then:

Waiting Room
     │
     │ signs
     ▼
Admission Token
     │
     ▼
Browser
     │
     ▼
API Gateway
     │
     │ verifies signature
     ▼
Reservation Service
A user can see the token, but cannot change:

WAITING
to:

ADMITTED
because that would invalidate the signature.

4. Admission token vs login JWT
It helps to think of tokens as proofs of different facts.

Token	Proves
Login/Auth JWT	Who you are
Access token	What APIs you may access
Refresh token	Allows obtaining another access token
Admission token	You passed the waiting room
Seat-hold token/ID	You currently own a temporary seat reservation
Payment token	Represents tokenized payment information
So one checkout might involve several:

Auth token
   ↓
"This is Oscar"

Admission token
   ↓
"Oscar is admitted to Event 123"

hold_id
   ↓
"Oscar currently holds seats A12/A13"

payment token
   ↓
"This token represents the customer's payment method"
They should not be thought of as interchangeable.

5. What is a session?
A session is the server's concept of an ongoing interaction with a particular browser/user.

For example, suppose you visit TicketSocket.

The server could create:

session_id = s_ABC123
and store:

s_ABC123
{
    userId: 555,
    eventId: 123,
    waitingRoomStatus: WAITING,
    queuePosition: 12450
}
Then later:

s_ABC123
{
    userId: 555,
    eventId: 123,
    waitingRoomStatus: ADMITTED
}
The browser needs some way of saying:

"I'm the browser associated with session s_ABC123."

That's where cookies commonly come in.

6. What is a cookie?
A cookie is a small value the browser stores for a website and automatically sends back on future HTTP requests to that website.

Server response:

Set-Cookie: queue_session=s_ABC123
Browser stores:

queue_session=s_ABC123
Later the browser requests:

GET /event/123/reserve
and automatically sends:

Cookie: queue_session=s_ABC123
The server can then look up:

s_ABC123
      ↓
Waiting Room Session Store
      ↓
status = ADMITTED
That's the basic idea.

7. Cookie vs session
These get confused constantly.

The cookie is stored in the browser.

The session is usually stored on the server.

For example:

Browser

cookie:
session_id=ABC
       │
       ▼
Server / Redis

ABC:
{
   userId: 123,
   status: ADMITTED
}
The cookie normally doesn't need to contain all the session data.

It may simply contain a random identifier.

8. Where would session state be stored?
For one server:

application memory
could technically work.

But that breaks when you horizontally scale:

Browser
   ↓
Load Balancer
   │
 ┌─┴──────────────┐
 ▼                ▼
Server A        Server B
If Server A knows about session ABC but Server B doesn't, you have a problem.

So distributed systems typically use:

Redis
Database
distributed session store
For example:

Browser
 cookie=ABC
     │
     ▼
Any waiting-room instance
     │
     ▼
Redis
     │
     ▼
session ABC
status = WAITING
Every server can retrieve the same session.

9. Or you can avoid server-side sessions
Instead of storing:

ABC → ADMITTED
in Redis, you can issue a signed token containing the state itself.

For example:

Admission JWT

{
   sessionId: ABC,
   eventId: 123,
   status: ADMITTED,
   exp: ...
}
Then:

Browser
   │
admission JWT
   │
   ▼
Gateway
   │
verify signature locally
Now the gateway doesn't necessarily have to query Redis.

This is stateless admission verification.

There are therefore two common models.

Stateful
Cookie
   ↓
session ID
   ↓
Redis
   ↓
ADMITTED?
Stateless
Cookie / header
   ↓
signed admission token
   ↓
verify signature
   ↓
ADMITTED?
And you can combine them.

10. How does the browser get redirected?
Now consider your exact example.

User manually enters:

tickets.example.com/event/123/reserve
but they're not admitted.

The request flows:

Browser
    │
GET /event/123/reserve
    │
    ▼
Edge
    │
    │ inspect cookie / admission token
    ▼
No valid admission
The edge can respond:

HTTP/1.1 302 Found
Location: /waiting-room?event=123
The browser automatically follows that redirect.

So:

/reserve
   ↓
Edge sees NO admission
   ↓
302 redirect
   ↓
/waiting-room
That is server/edge-side route protection.

11. What happens after the user gets admitted?
Suppose they wait:

WAITING
   ↓
WAITING
   ↓
WAITING
   ↓
ADMITTED
The waiting-room service can issue the admission token:

Waiting Room
     │
     ▼
Set-Cookie:
admission_token=eyJ...
Then the browser navigates:

/event/123/reserve
Now:

Browser
   │
Cookie: admission_token=...
   ▼
Edge
   │
verify signature
   │
eventId = 123 ✓
status = ADMITTED ✓
exp valid ✓
   │
   ▼
Ticketing application
The request is allowed through.

12. Should the client also check?
Yes—but client checks are only for UX.

Suppose your Vue/React application knows:

waitingRoom.status = WAITING
and the user tries:

router.push('/reserve')
A client-side route guard can say:

if status !== 'ADMITTED':
    router.push('/waiting-room')
So:

Vue Router
   │
   ├── admitted → reservation page
   │
   └── waiting → waiting-room page
That prevents confusing UI behavior.

But this is not security.

A user can bypass JavaScript and directly make:

POST /api/reservations
using:

curl
Postman
custom script
Therefore the backend/gateway must independently enforce admission.

13. The proper design is both client and server enforcement
Client:

if not admitted:
    show waiting room
Server:

if admission token invalid:
    reject request
Think:

CLIENT CHECK
= usability

SERVER CHECK
= security
Never rely solely on:

Vue route guard
React route guard
hidden button
disabled button
for authorization.

14. Full example
Suppose the user goes to:

https://tickets.example.com/events/123/seats
Request 1
Browser
   │
GET /events/123/seats
   │
Cookie:
auth_token=XYZ
(no admission token)
   │
   ▼
CloudFront / Edge Worker
Edge evaluates:

authentication valid? YES
admission for event123? NO
Response:

302 /events/123/wait
Waiting-room page
Browser receives:

/events/123/wait
Waiting-room frontend calls:

POST /queue/join

eventId = 123
Server creates:

queueSessionId = Q456
status = WAITING
Browser receives cookie:

Set-Cookie:
queue_session=Q456;
Secure;
HttpOnly;
SameSite=Lax
15. What do Secure / HttpOnly / SameSite mean?
These are important cookie security settings.

Secure
Secure
means:

Only send this cookie over HTTPS.

So never:

http://tickets.example.com
only:

https://tickets.example.com
HttpOnly
HttpOnly
means JavaScript cannot do:

document.cookie
and steal/read that cookie.

This helps reduce token theft through XSS.

The browser still automatically sends the cookie with requests.

SameSite
Controls when cookies are sent during cross-site navigation.

Common values:

Strict
Lax
None
This helps mitigate CSRF.

For many authentication/session cookies:

SameSite=Lax
is a reasonable common choice, depending on the flow.

16. Queue polling
Browser periodically asks:

GET /queue/Q456/status
with cookie:

queue_session=Q456
Response:

{
  "status": "WAITING",
  "approxPosition": 19234
}
Later:

{
  "status": "ADMITTED"
}
Then the server may issue:

Set-Cookie:
event_123_admission=<signed-token>;
Secure;
HttpOnly;
SameSite=Lax
Now the browser has proof of admission.

17. Client redirects after admission
The Vue/React page sees:

{
   "status": "ADMITTED"
}
and does:

router.replace('/events/123/seats')
So yes, the client can initiate the navigation once it learns it has been admitted.

But when the browser requests that route, the edge/server still checks the admission cookie.

That gives:

Waiting room status changes
       │
       ▼
Client learns ADMITTED
       │
       ▼
Client navigates to /seats
       │
       ▼
Edge verifies admission token
       │
       ▼
Reservation application
18. What if the user manually changes the URL?
Suppose they're waiting and type:

/events/123/seats
The client-side router might initially catch it.

But even if they bypass it:

direct HTTP request
the server sees:

no valid event123 admission token
and does:

302 → /events/123/wait
Or for an API call:

POST /api/reservations
the backend might return:

403 Forbidden
or perhaps:

428 Admission Required
depending on your API convention.

Typically:

PAGE REQUEST
→ redirect

API REQUEST
→ 401/403-style JSON error
That's often cleaner.

19. Page route vs API route
This distinction matters.

Suppose:

GET /events/123/seats
is a frontend page.

You might redirect:

302 /events/123/wait
But:

POST /api/events/123/reservations
should not usually redirect to HTML.

Instead:

HTTP 403

{
  "code": "WAITING_ROOM_ADMISSION_REQUIRED"
}
Then the frontend can interpret that and send the user to the waiting room.

20. A complete architecture
                    Browser
                       │
                       │ auth cookie
                       │ admission cookie
                       ▼
                CDN / Edge Layer
                       │
              ┌────────┴────────┐
              │                 │
       admission valid?     admission absent
              │                 │
             YES               NO
              │                 │
              ▼                 ▼
       Ticketing App      Waiting Room App
              │                 │
              │            Queue Service
              │                 │
              │                Redis
              │                 │
              │          status=WAITING
              │                 │
              │          status=ADMITTED
              │                 │
              │          issue signed token
              │                 │
              └─────────◄───────┘
                       │
                       ▼
               Reservation API
                       │
                       ▼
                Inventory Service
21. One subtle point: authenticated vs anonymous buyers
The queue session doesn't necessarily require a logged-in user.

For example:

anonymous visitor
      ↓
queue session cookie
      ↓
WAITING
Then later:

ADMITTED
   ↓
login
   ↓
select seats
Or you might require login before entering the queue.

Both designs are possible.

The session identity might therefore be:

queue_session_id
rather than:

user_id
until authentication happens.

22. A good session model
Conceptually:

queue_sessions

session_id
event_id
user_id nullable
status
joined_at
priority
admitted_at
expires_at
For example:

Q123
event = TSLA-2026-LA
user = 456
status = ADMITTED
joined = 09:51
admitted = 10:11
expires = 10:26
The browser holds only:

Q123
or a signed representation of it.

The authoritative state is controlled by the server.

23. What I'd do in a real design
I would likely use:

Browser
    │
    ▼
CloudFront / Cloudflare
    │
    ▼
Edge function
    │
    ├── validate admission cookie
    │
    ├── admitted → origin
    │
    └── not admitted → waiting-room origin
Waiting room:

Stateless Queue API
       │
       ▼
Redis cluster
Admission:

Redis status → ADMITTED
       │
       ▼
issue short-lived signed admission token
Then the reservation APIs also validate:

auth token
+
admission token
That last part matters because even if the edge is accidentally bypassed, the sensitive backend still enforces admission.

The simplest mental model
Think of going to a concert venue physically.

Your authentication token is:

"This is Oscar."

Your queue session is:

"Oscar is number 12,438 in line."

Your admission token is:

"Security has let Oscar through the front gate."

Your seat hold is:

"Oscar currently has A12 reserved for eight minutes."

Your order/payment record is:

"Oscar successfully bought A12."

And the system is enforcing these progressively:

IDENTITY
   ↓
QUEUE
   ↓
ADMISSION
   ↓
SEAT HOLD
   ↓
PURCHASE
That's the cleanest way to reason about the entire ticket-sale flow in a system-design interview.

I have an interview with a company who keeps grilling me hard on the resume i have attached. For each item of my job experiences (do not miss a single one) can you emulate being a lead software engineering interviewer interviewing me for a lead role and ask me system design type questions, a few questions for each of the points i have under each company in EXPERIENCE section. It is very important not to miss a single point since they really use the resume past experience company points and personal projects points to ask how i accomplished what i satated on each point and how i system designed it - do not miss a single point to make a few questions for

Yes. I went through the attached resume line-by-line. There are 17 distinct EXPERIENCE bullets plus 1 Personal Project bullet, and I cover every one below. I’d expect a hard Lead Engineer interviewer to treat every quantified or architectural claim as an invitation to drill down into what you personally owned, architecture, data flow, scale, consistency, failure behavior, security, observability, and tradeoffs.

A strong practice rule: answer the first question for each bullet in ~90 seconds, then assume the interviewer interrupts with the remaining questions.

Gala Games & Entertainment — Lead Full Stack SE
Your resume has five Gala bullets spanning the Vue/React Native/backend/blockchain surfaces, Gala Film, 10,000+ concurrency, Vision/vector/Sanity automation, and token/ICO launch ownership. 

1. “Drove full-stack engineering for Gala collectibles, Film, and Web3 launch workflows across Vue.js web, React Native TV, backend APIs, and blockchain product surfaces.”
Lead interviewer questions:

“Draw the end-to-end architecture for one of those Gala product flows. Start at the Vue or React Native client and take me all the way through your APIs and blockchain interaction. What were the major services and data stores?”

“You mention web, TV, APIs, and blockchain in one bullet. How did you divide responsibilities between those layers? What business state lived in your backend versus on-chain?”

“How did you deal with eventual consistency between blockchain state and application state? Suppose a transaction was submitted but not yet finalized—what did the user see?”

“How did you prevent the Vue web app and React Native TV application from implementing different versions of the same domain logic? What did you share versus intentionally keep platform-specific?”

“Tell me about one architecture decision you personally made here that another senior engineer disagreed with. What alternatives did you evaluate, and why did your design win?”

Likely pressure follow-up:

“You keep saying ‘we.’ What specifically did you architect or implement?”

Be prepared to name an actual service, API, state machine, data model, component or infrastructure decision.

2. “Led Gala Film application delivery for creator-to-fan media flows, digital ownership, NFT collectibles, and reward-driven viewer experiences.”
“Design the Gala Film platform for me. How does a creator upload content, how is that content processed, and how does a viewer ultimately stream it?”

“Where would you store the actual video versus metadata versus ownership information? Why would you choose object storage, MongoDB, blockchain, or another store for each?”

“How did you represent digital ownership? If a user owned an NFT that unlocked a film or reward, how did the application efficiently determine entitlement without querying the blockchain for every page request?”

“Design the reward flow. A user watches content and earns a reward. How do you prevent someone from replaying requests or opening 100 browser sessions and claiming the same reward repeatedly?”

“What happens when the media system says the viewer finished the movie but the blockchain/reward system is temporarily unavailable? How would you guarantee the reward eventually gets issued without issuing it twice?”

That last question invites:

Viewer event
    ↓
Reward eligibility
    ↓
Durable event/queue
    ↓
Reward worker
    ↓
Blockchain
Expect them to ask about idempotency keys, durable queues, retries, DLQs, and reconciliation.

3. “Architected Node.js/NestJS services on AWS/GCP with MongoDB, scaling media, collectibles, user-state, and blockchain workflows to 10,000+ concurrent users.”
This is one of the bullets I would expect them to attack hardest.

“What specifically changed between the architecture before scaling and the architecture that handled 10,000+ concurrent users? Draw both.”

“What was the bottleneck at 350, 1,000, 5,000, and 10,000 concurrent users? Was it Node CPU, database connections, Mongo queries, external APIs, memory, network, or something else?”

“How were the NestJS services deployed? Were they stateless? How did you horizontally scale them, and how did the load balancer determine which instance received a request?”

“How was MongoDB modeled and indexed? Give me an actual high-volume query and tell me what index supported it. How would you detect an inefficient collection scan?”

“How did you verify the claim of 10,000 concurrent users? Was this production traffic or load testing? What were p50/p95/p99 latency, throughput, CPU, error rate, and DB saturation?”

Then expect:

“Why MongoDB rather than PostgreSQL?”

“Why AWS and GCP?”

“What state prevented your NestJS service from being completely stateless?”

“How did you handle database connection pooling?”

4. “Integrated GCP Vision API, vector search, and Sanity CMS to automate film content ops, static inputs, thumbnail prep, image selection, and release metadata.”
“Walk me through this pipeline from a Sanity content change to the final automated image selection. What triggered what?”

“What exactly did you send to GCP Vision? What labels or signals came back, and how were those results persisted?”

“Where did vector search enter the design? What exactly was embedded—the image, Vision labels, film metadata, text descriptions, or some combination?”

“What embedding model and vector store did you use? If you don't remember the exact provider, explain the retrieval architecture and what similarity metric you needed.”

“How did you prevent an automated system from selecting a visually similar but semantically wrong thumbnail and publishing it directly to production?”

Be ready to draw:

Sanity CMS
    ↓ webhook
Processing worker
    ↓
GCP Vision
    ↓
metadata/features
    ↓
Embedding
    ↓
Vector store
    ↓
Similarity/ranking
    ↓
candidate image
    ↓
Sanity writeback/review
They may specifically challenge whether Vision and embedding search had separate purposes.

5. “Owned production-critical token/ICO launch flows across user experience, backend services, release operations, and blockchain-integrated application paths.”
“Design an ICO/token launch capable of handling a massive traffic spike at the exact launch time. How would you protect the backend?”

“How did you prevent users from purchasing more tokens than allowed or submitting the same purchase twice?”

“Where was the source of truth for the token purchase—your database or blockchain—and how did you reconcile disagreements?”

“Suppose the blockchain transaction succeeds but your backend times out before recording success. What happens next?”

“What was your deployment/release strategy for something this high risk? Did you use feature flags, staged rollout, pre-warming, rollback procedures, dashboards, or runbooks?”

High-value concepts:

idempotency
transaction state machines
rate limiting
queues
reconciliation
block confirmations
circuit breakers
feature flags
observability
Frequence + Madhive — Lead Senior SE
Your resume contains five bullets here: platform/acquisition maturity, technical direction across 30+ engineers/QAs, Angular framework/widgets, AI-assisted regression testing with measured outcomes, and configurable workflow validation. 

6. “Contributed to platform execution and engineering maturity that supported Frequence’s acquisition by Madhive across omnichannel workflow and local CTV infrastructure.”
“What did ‘platform execution and engineering maturity’ concretely mean? What architectural problems existed when you joined, and what did you change?”

“Draw the core omnichannel architecture. How would CTV, radio, display, and other products share workflow infrastructure without becoming one giant conditional codebase?”

“What technical characteristics make an AdTech workflow system difficult to scale—data volume, configuration variation, integrations, latency, reporting, or something else?”

“What technical work did you personally do that made the platform more reliable or maintainable enough to support enterprise growth?”

“If Madhive engineers performed technical diligence on the platform, which architectural areas would have concerned them most, and what evidence could you give them that those risks were controlled?”

The interviewer is probing whether “supported acquisition” is substantive or decorative language.

7. “Provided technical direction for 30+ engineers/QAs across frontend architecture, testing strategy, design systems, PR standards, offshore coordination, and product breakdown.”
This is a Lead-role credibility bullet.

“Thirty-plus engineers is too many to directly manage technically. What operating model did you use to influence that many people?”

“How did architecture decisions get proposed, reviewed, documented, and enforced? Did you use RFCs, ADRs, architecture reviews, linters, shared libraries, or CI gates?”

“Tell me about a PR standard you introduced that materially changed engineering quality. How did you keep it from becoming process bureaucracy?”

“How did you decide what belonged in the shared design system versus the individual product/application?”

“Take a large product request and show me how you would break it into frontend, backend, QA, infrastructure, and rollout work that could be distributed across multiple teams.”

Likely follow-ups:

“How did you handle disagreement between teams?”

“How did you prevent yourself from becoming the architecture bottleneck?”

“How did offshore teams receive sufficient context to make independent decisions?”

8. “Helped lead Frequence’s core Angular framework, building extensible widgets and configurable UI systems for AdTech planning, activation, and reporting workflows.”
This is another bullet they can drill into for a long time.

“What was a ‘widget’ in this system? Take one real widget—geography, audience, or product selection—and show me its interface and lifecycle.”

“How did the framework decide which widgets appeared for a particular product or workflow state? Was that configuration-driven or hard-coded?”

“How did widgets communicate without becoming tightly coupled? Shared state? RxJS? Service layer? Event bus? Inputs/outputs?”

“How did you version the framework so dozens of workflows could evolve without breaking existing campaigns?”

“If you needed to migrate this architecture from Angular to React today, which parts of the architecture would survive unchanged and which would need to be rewritten?”

For your examples, be prepared to talk specifically about:

Geography widget
→ geofence / locations

Audience widget
→ demographic / segment

Product-selection widget
→ CTV / Radio / etc.
The interviewer may ask for:

configuration → widget registry → state model → validation → API payload
9. “Built AI-assisted regression/E2E automation with Playwright, Jest, Claude multimodal testing, and Datadog, reducing production bugs by 50% and manual QA by 60%.”
This is probably one of your most attackable quantified bullets.

“Take one actual Playwright test. What was the business workflow, fixture/setup, actions, assertions, and cleanup?”

“Where exactly was Claude multimodal involved? Was the model determining correctness, comparing screenshots, generating tests, triaging failures, or something else?”

“Why use Claude for something deterministic test assertions could handle? What did AI contribute that normal Playwright could not?”

“How did the tests run in CI? What blocked deployment versus generated a non-blocking warning?”

“Explain the 50% production-bug reduction and 60% manual-QA reduction. What baseline and time window did you use, and how do you know the automation caused it?”

Also expect:

“How did you deal with flaky tests?”

“How did you prevent LLM nondeterminism from creating false failures?”

“What did Datadog contribute?”

10. “Automated browser validation across high-variation customer workflows, improving release confidence for configurable, production-critical business paths.”
“What made these workflows ‘high variation’? Give me a concrete example of two configurations that resulted in substantially different UI behavior.”

“If you had hundreds of combinations of statuses, products, widgets, and customer configurations, how did you avoid a combinatorial explosion in E2E tests?”

“How did you generate or select representative test configurations?”

“How did you structure Playwright fixtures so the tests weren't hard-coded to one customer's environment?”

“Suppose the same workflow behaves differently for CTV, Spectrum TV, and Radio. How would you model that test suite?”

A strong diagram to be ready for:

Strategy configuration
       ↓
workflow state
       ↓
expected widgets/actions
       ↓
Playwright scenario
       ↓
API + UI assertions
TicketSocket & IceCreamSocial — Lead Full Stack SE
Your resume has five bullets here: AngularJS migration, configurable dashboards, PostgreSQL optimization/event processing, 350→10,000+ concurrency with JWT-based service allocation, and testing/API-documentation improvements. 

11. “Migrated AngularJS to React + TypeScript, improving architecture, testability, design-system reuse, and product/design collaboration via Storybook.”
“You cannot freeze a production ticketing platform while rewriting it. How did you migrate AngularJS to React incrementally?”

“How did AngularJS and React coexist during migration? Did you use route-level migration, component wrappers, microfrontends, or another strangler pattern?”

“How did you handle shared state while old and new frameworks coexisted?”

“What did TypeScript catch or make possible that materially improved the architecture?”

“How was Storybook integrated into the workflow between engineering and design, and how did you ensure Storybook components stayed equivalent to production components?”

Expect:

“Why React?”

“Why not simply upgrade AngularJS to modern Angular?”

“How did you measure that architecture/testability actually improved?”

12. “Built configurable dashboards for events, inventory, influencer campaigns, ticketing operations, and white-label partner workflows.”
“Design the configuration system behind those dashboards. What was hard-coded and what was metadata-driven?”

“How did tenant/merchant configuration determine branding, permissions, widgets, and available business operations?”

“How did you isolate data for multiple white-label customers so merchant A could never access merchant B's events or sales?”

“How did you handle authorization for users with different roles—merchant admin, cashier, event manager, support, end customer?”

“If one dashboard needed inventory in real time while another needed large historical reports, would you use the same API/data path? Why or why not?”

This naturally opens discussion of:

multi-tenancy
RBAC
tenant_id
configuration metadata
cached read models
real-time vs analytical workloads
13. “Optimized PostgreSQL data flows with indexing, stored procedures, triggers, webhooks, and transactional event processing.”
I would expect a strong backend interviewer to spend 10–15 minutes here.

“Give me a real slow PostgreSQL query you improved. What was the original query plan, what index did you introduce, and why did its column order matter?”

“What logic belonged in stored procedures/triggers instead of application code? Why?”

“What were the downsides of using triggers? How did you make side effects discoverable and testable?”

“Explain your transactional event processing. How did you make sure the database update and event publication could not get out of sync?”

“Square sends a duplicate or out-of-order webhook for an order that moved through in_process → completed → refund_requested → refunded. How do you ensure an older event cannot overwrite the newer state?”

Expect concepts like:

unique constraints
indexes
transactions
optimistic concurrency
source version
idempotency
outbox pattern
webhook signature verification
DLQ/reconciliation
14. “Re-architected AWS ticketing services, scaling from 350 to 10,000+ concurrent users with JWT-based service allocation.”
This may be the single bullet I would prepare most aggressively.

“Draw the architecture that supported 350 concurrent users, then draw what you changed to handle 10,000+. What exactly was the original bottleneck?”

“What does ‘JWT-based service allocation’ mean? Walk me through the JWT claims, who issued the token, who verified it, and how it affected routing or tenant allocation.”

“For seated events, how did your architecture guarantee two customers couldn't purchase the same seat under extreme concurrency?”

“A popular event goes on sale and one million users arrive within seconds. Which layers absorb the burst before it reaches PostgreSQL?”

“How did you validate that the architecture supported 10,000 concurrent users? What load-test shape did you use and what metric became the limiting factor?”

Be ready for this exact whiteboard:

Users
 ↓
CDN / WAF
 ↓
Waiting room
 ↓
Rate limiter
 ↓
Load balancer/API
 ↓
Stateless ticketing services
 ↓
Reservation service
 ↓
Strongly consistent inventory
And then:

AVAILABLE
   ↓ atomic
HELD
   ↓ payment success
SOLD
They may also ask why Redis is useful but why Redis alone should not be the source of truth for seat ownership.

15. “Raised test coverage from near-zero to 70% across a 90,000+ line codebase and created Redocly/Swagger API docs for partner onboarding.”
“How did you move a 90,000-line legacy system from almost no tests to 70% without stopping feature development?”

“Which tests gave the highest return first: unit, integration, API, database, or E2E?”

“Did you enforce a coverage threshold globally or only on changed code? Why?”

“How did you test legacy code that wasn't originally designed for dependency injection or isolation?”

“How did OpenAPI/Swagger become more than static documentation? Did you use it for request validation, generated clients, contract testing, partner sandboxes, or CI validation?”

And expect:

“Why 70%? Why not 100%?”

The right discussion is risk coverage, not chasing a number.

Visa — Full Stack Engineer
The Visa section has exactly two bullets: Angular/D3 infrastructure-risk dashboards and a real-time Angular/Node vendor portal. 

16. “Built Angular/D3.js risk dashboards with data science teams to surface infrastructure exposure across Visa’s network, reducing incidents by 30%+.”
“What was the data pipeline feeding the dashboard? Where did the raw infrastructure-risk data originate, how was it transformed, and how did it reach Angular/D3?”

“Was the dashboard querying raw operational data directly, or did you create an aggregated/read-optimized model? Why?”

“How did you visualize a large infrastructure topology without overwhelming the browser? What happened if there were tens of thousands of nodes?”

“How did you determine what constituted ‘risk’? Was that computed by data-science models, backend services, or the frontend?”

“Explain the 30% incident reduction. What metric counted as an incident and how did you establish that the dashboard contributed?”

Potential follow-up:

“If the risk data was stale by 15 minutes, would that be acceptable? How would that affect your architecture?”

17. “Developed a real-time Angular/Node vendor portal, cutting third-party tool approval cycles by 80%+.”
“What does ‘real-time’ mean here technically? WebSockets? SSE? Polling? Event-driven backend updates?”

“Draw the workflow for a vendor submitting a tool through review, approvals, rejection, remediation, and final authorization.”

“How would you model a multi-step approval workflow where different departments can approve or reject independently?”

“How would you maintain an auditable history so Visa could prove who changed or approved each state?”

“Explain how you measured the 80% reduction. Which manual or asynchronous step disappeared because of the portal?”

I would expect questions around:

workflow state machine
RBAC
audit logs
notifications
real-time updates
transactional consistency
Personal Project — Agentic Engine
Your resume describes a workflow engine that compiles goals into DAGs using LLM critics/evals, strict JSON schemas, beam search, MCP tooling, RAG, XState, TypeScript/Node, and Python. 

18. “Workflow engine compiling goals into DAGs using LLM critics/evals, strict JSON schemas, beam search, MCP tooling, RAG, XState, TypeScript, Node, Python.”
This is another bullet that could generate an entire system-design interview.

“Start from a user's natural-language goal. Show me exactly how that becomes a DAG. What are your node and edge data models?”

“Why a DAG? What kinds of workflows cannot be represented cleanly as a DAG, and how do you handle loops or retries?”

“Where do LLM critics/evaluators enter the planning process? Do they score complete plans, individual nodes, or execution results?”

“Explain your beam search. What constitutes a candidate state, what is the beam width, what is the scoring function, and when do you stop searching?”

“How do strict JSON schemas protect the system from LLM nondeterminism? What happens when the model produces structurally valid but semantically invalid output?”

“What role does XState play relative to the DAG? Why do you need both a state machine and a graph?”

“Where does MCP fit? How are tools discovered, permissioned, invoked, and validated?”

“Explain your RAG pipeline. What gets chunked and embedded, what retrieval strategy do you use, and where does reranking happen?”

“How do you recover if node 8 of a 20-step workflow fails after the first seven nodes already caused side effects?”

“How would you horizontally scale this engine to execute thousands of workflows concurrently without executing a node twice?”

For the final question, be ready to discuss something like:

Workflow request
      ↓
Planner
      ↓
Versioned DAG
      ↓
Durable workflow store
      ↓
Ready-node queue
      ↓
Worker pool
      ↓
Tool execution
      ↓
Result store
      ↓
Evaluator
      ↓
next runnable nodes
with:

idempotency keys
leases
checkpoints
retries
DLQs
compensation
distributed workers
observability
Questions they can use against almost any resume bullet
After you've answered any of the 18 areas above, expect the Lead interviewer to switch into the same pressure-test sequence:

“Draw it.”
They want components and data flow, not abstract descriptions.

“What did you personally own?”
Separate your contribution from the team's.

“Why did you choose that technology?”
Give alternatives and tradeoffs rather than “that's what we used.”

“What was the scale?”
Requests/sec, events/sec, data size, concurrency, number of tenants, latency.

“What failed?”
Timeouts, duplicate messages, DB outage, queue backlog, third-party outage.

“How did you prevent duplicates?”
Idempotency, unique constraints, conditional writes, source versions.

“What consistency did you require?”
Strong versus eventual, and why.

“How did you observe it?”
p50/p95/p99, error rate, queue lag, CPU, DB connections, traces.

“How was it secured?”
Authentication, authorization, tenant isolation, secrets, encryption.

“How do you know the metric on your resume is true?”
Be able to explain every 10,000+, 50%, 60%, 70%, 30%, and 80%.

The most dangerous answers for your particular resume are vague statements such as “we used AWS to scale,” “Kafka handled the events,” “Redis made it faster,” “Auth0 handled security,” or “Playwright automated testing.” At Lead level, they're likely to immediately ask what exact problem that component solved, what data moved through it, what happened on failure, and why you chose it instead of the alternative.

A good next preparation step is to take these 18 resume bullets one at a time and build a 2–3 minute “defense” for each containing: architecture diagram → one concrete implementation detail → scale → failure scenario → tradeoff → your personal ownership. That will prepare you much better for a resume-grilling interview than memorizing generic system-design answers. 




Yes. I’ll treat this as a **Lead Engineer resume-defense playbook**.

One important constraint: your resume establishes the claims, technologies, and outcomes, but it does **not** establish every low-level implementation detail an interviewer could ask about. I won’t manufacture past experience for you. When the resume or details you’ve already given me support something, I’ll write it as an interview-ready first-person answer. Where you need to confirm an implementation detail from memory, I’ll mark it **[VERIFY]**. Before the interview, replace those with what you actually did.

I’m covering **every question and follow-up from the previous response**, including the cross-cutting questions at the end.

---

# GALA GAMES AND ENTERTAINMENT

Your resume claims five distinct Gala areas: full-stack collectibles/Film/Web3 work, Gala Film delivery, Node/NestJS scalability to 10,000+ concurrent users, Vision/vector/Sanity automation, and production-critical token/ICO launches. Oscar Gonzalez - Lead Engineer …

# 1. Full-stack engineering across Vue, React Native TV, APIs, and blockchain

### Q1. “Draw the end-to-end architecture for one of those Gala product flows.”

A strong answer is to choose **one concrete product**, rather than attempting to describe all of Gala.

For example, collectibles:

```text
                         USER
                          │
                ┌─────────┴──────────┐
                │                    │
                ▼                    ▼
          Vue.js Web App       React Native TV
                │                    │
                └─────────┬──────────┘
                          │ HTTPS
                          ▼
                   API Gateway / LB
                          │
                          ▼
                 Node.js / NestJS API
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
        ▼                 ▼                  ▼
     MongoDB          Auth/User State     CMS / Media
        │                                    │
        │                                    ▼
        │                                  Sanity
        │
        ▼
 Blockchain Integration Layer
        │
        ▼
 GalaChain / Web3 infrastructure
```

I would explain it like:

> “I separated the system into client presentation, application/domain services, off-chain application state, and blockchain state. Vue and React Native TV were clients rather than authoritative stores. NestJS APIs normalized access to user state, collectible metadata, entitlement information, and blockchain workflows. MongoDB handled application-oriented state where fast application queries were more appropriate than querying the blockchain directly. Blockchain calls were isolated behind an integration layer because chain interactions have very different latency and failure semantics from ordinary database calls.”

For an asynchronous blockchain operation:

```text
Client
  │
  │ POST action
  ▼
NestJS
  │
  ├── validate user
  ├── validate request
  ├── persist PENDING operation
  │
  ▼
Blockchain interaction
  │
  ├── submitted
  ├── confirmation/finalization
  │
  ▼
Update application state
  │
  ▼
Client sees COMPLETED
```

Lead-level points to mention:

- clients are not trusted sources of ownership;
- blockchain access is abstracted;
- state transitions should be explicit;
- chain operations should be idempotent where possible;
- long-running operations should not hold an HTTP request open indefinitely;
- retries must distinguish “request failed” from “transaction may have succeeded.”

For CI/CD, a sensible architecture would include:

```text
PR
 ↓
lint + typecheck
 ↓
unit/integration tests
 ↓
build Vue / RN / Nest artifacts
 ↓
security/dependency scanning
 ↓
staging
 ↓
E2E/smoke tests
 ↓
production deployment
```

Use that only to the extent it matches your actual pipeline.

---

### Q2. “How did you divide responsibilities between the frontend, backend and blockchain?”

Interview-ready answer:

> “I tried to keep each layer responsible for the type of state it was best suited to own. The frontend owned presentation and transient UX state. Backend services owned application workflows, authorization, metadata, caching and integration orchestration. Blockchain was used for state that actually needed blockchain guarantees—for example digital ownership or blockchain-native transactions. I specifically would not have the client directly decide that a user owned an asset based on client state.”

Think:

```text
Frontend
--------
rendering
navigation
local UX state
optimistic UI

Backend
-------
authorization
business rules
aggregation
CMS integration
user/application state
blockchain orchestration

Blockchain
----------
canonical on-chain ownership
token transactions
immutable blockchain state
```

A strong phrase is:

> “The blockchain was a system of record for blockchain-native state, but it was not the optimal read model for every user-facing screen.”

That explains why an application database/cache may still exist.

---

### Q3. “How did you deal with eventual consistency between blockchain state and application state?”

Treat chain interaction as a **state machine**, not a synchronous database call.

```text
REQUESTED
    │
    ▼
SUBMITTED
    │
    ▼
PENDING_CONFIRMATION
    │
    ├── FAILED
    │
    ▼
CONFIRMED
```

I would answer:

> “The main issue is that successful submission is not the same as final blockchain confirmation. I would persist the transaction identifier and internal operation state, expose a pending state to the client, and reconcile chain state asynchronously. The UI could optimistically show ‘processing,’ but I would not show final ownership until the confirmation criteria were met.”

Example schema:

```text
blockchain_operations
---------------------
operation_id
user_id
transaction_hash
operation_type
status
created_at
confirmed_at
error_code
```

If the API process dies after submission:

```text
NestJS ── submit ──> Blockchain
  X
process dies

Reconciler
   │
   ├── finds SUBMITTED operation
   ├── checks transaction_hash
   └── moves to CONFIRMED / FAILED
```

That is much safer than blindly retrying and potentially issuing a second chain transaction.

---

### Q4. “How did you keep Vue and React Native TV from duplicating domain logic?”

You want to distinguish **shared domain contracts** from **platform-specific presentation**.

```text
                   Shared packages
                 ┌──────────────────┐
                 │ API types        │
                 │ schemas          │
                 │ domain enums     │
                 │ validation       │
                 │ DTOs             │
                 └────────┬─────────┘
                          │
             ┌────────────┴───────────┐
             ▼                        ▼
          Vue Web               React Native TV
          browser UX            remote-control UX
```

Good answer:

> “I would share API contracts, domain types, state definitions and reusable business rules where they were genuinely platform-independent, but I would not force web UI components into TV. TV has completely different focus navigation, remote-input and playback UX requirements.”

For example:

```ts
type EntitlementStatus =
  | 'LOCKED'
  | 'AVAILABLE'
  | 'OWNED'
  | 'PENDING';
```

Both apps can share that model while implementing different views.

---

### Q5. “Tell me about an architecture decision another senior engineer disagreed with.”

This must come from a real disagreement. Do **not invent one**.

Use this format:

> “The decision was X. The competing design was Y. I compared them using scalability, implementation complexity, failure isolation, developer velocity and migration risk. We prototyped or measured Z. I ultimately recommended X because ____. The important part was that I documented the tradeoff and changed my position where the other design had better evidence.”

Lead interviewers care more about:

```text
disagreement
   ↓
technical criteria
   ↓
evidence
   ↓
decision
   ↓
follow-up measurement
```

than whether you “won.”

---

### Follow-up: “You keep saying we. What did YOU own?”

Say something like:

> “The broader product was obviously a team effort. My personal ownership was at the architecture and implementation boundaries I can defend in detail. For example, I personally worked on [VERIFY: specific NestJS service/API], [VERIFY: specific Vue/TV flow], and [VERIFY: blockchain/CMS integration]. I can walk through the code-level design of those pieces separately from work done by the rest of the team.”

Always separate:

```text
Team outcome
vs.
My design
vs.
My implementation
vs.
My review/leadership
```

---

# 2. Gala Film creator-to-fan media, ownership and rewards

### Q1. “Design the Gala Film platform.”

A solid media architecture:

```text
Creator
   │
   │ upload metadata/content
   ▼
CMS / Upload API
   │
   ├───────────────► Sanity CMS
   │
   ▼
Object Storage
   │
   ▼
Media Processing Pipeline
   │
   ├── transcode
   ├── thumbnails
   ├── metadata
   └── moderation/classification
   │
   ▼
Media Origin
   │
   ▼
CDN
   │
   ▼
Viewer

Viewer App
   │
   ▼
Playback API
   │
   ├── authenticate
   ├── entitlement check
   └── signed playback authorization
```

Separate **control plane** and **media plane**:

```text
Control plane
-------------
metadata
entitlement
user state
ownership
rewards

Media plane
-----------
large video objects
streaming
CDN
transcoding
```

The API should not stream gigabytes through NestJS.

---

### Q2. “Where do video, metadata and ownership live?”

Answer:

> “I would use specialized stores. Large immutable video blobs belong in object storage/CDN. Editorial metadata belongs in a CMS or application database. Blockchain-native ownership belongs on-chain, while a query-optimized application projection can make entitlement checks fast.”

```text
Video             → object storage/CDN
Film metadata     → Sanity/application store
User app state    → MongoDB
Blockchain asset  → GalaChain
Fast entitlement  → backend projection/cache [if used]
```

Why not MongoDB for video?

> “Databases are optimized for structured records and queries, not cost-effective delivery of multi-gigabyte media assets.”

---

### Q3. “How do you efficiently determine NFT entitlement?”

Avoid:

```text
every playback request
       ↓
live blockchain query
```

because chain calls can be slow and unreliable.

Instead:

```text
Blockchain events
      │
      ▼
Ownership indexer
      │
      ▼
Query-optimized ownership projection
      │
      ▼
Entitlement Service
      │
      ▼
Playback decision
```

An entitlement cache might be:

```text
(user_id, asset_id) → OWNED / NOT_OWNED
```

Security principle:

> “The cache can accelerate the decision, but its provenance must ultimately trace back to authoritative ownership state.”

If Gala actually queried through a specific GalaChain service rather than indexing, describe the real approach.

---

### Q4. “How do you prevent reward abuse?”

The core requirement is:

```text
one eligible activity
→ at most one reward
```

Use an eligibility ID/idempotency key:

```text
reward_key =
user_id + content_id + reward_window
```

Then enforce uniqueness:

```sql
UNIQUE(reward_key)
```

Architecture:

```text
Playback telemetry
      │
      ▼
Eligibility Service
      │
      ├── auth user
      ├── validate watch criteria
      ├── anti-abuse checks
      │
      ▼
Reward Event
      │
      ▼
Queue
      │
      ▼
Reward Worker
      │
      ├── atomic idempotency check
      └── blockchain reward
```

Also discuss:

- authenticated user identity;
- server-generated playback/session IDs;
- minimum watch duration;
- impossible event sequencing;
- device/session limits if applicable;
- rate limits;
- anomaly/fraud detection.

Do not trust:

```text
POST /reward
{
  "watchedMovie": true
}
```

from the client.

---

### Q5. “Media says watched, blockchain unavailable. How do you eventually issue exactly one reward?”

Use durable asynchronous processing:

```text
Eligibility established
       │
       ▼
DB transaction
  reward = PENDING
       │
       ▼
Durable queue
       │
       ▼
Reward worker
       │
       ├── blockchain available? no
       │       ↓
       │    retry/backoff
       │
       └── yes
              ↓
          submit reward
              ↓
          record tx hash
              ↓
          CONFIRMED
```

You generally deliver **effectively-once**, not magical global exactly-once semantics.

Important components:

```text
idempotency key
persistent operation row
queue
exponential backoff
DLQ
reconciler
transaction/hash tracking
```

If the blockchain submission response times out:

> “I don't immediately submit another reward. I reconcile whether the first operation succeeded.”

---

# 3. Gala NestJS/AWS/GCP/MongoDB at 10,000+ concurrency

### Q1. “What changed between before and after scaling?”

Your resume supports the 10,000+ concurrent claim, but not every intermediate architecture detail. Oscar Gonzalez - Lead Engineer …

Use an evidence-driven answer:

```text
BEFORE

Users
 ↓
few application instances
 ↓
backend
 ↓
DB / external dependencies


AFTER

Users
 ↓
CDN / edge
 ↓
Load Balancer
 ↓
Stateless NestJS instances
 ↓
┌──────────┬─────────────┐
▼          ▼             ▼
Cache    MongoDB       Async workers
          │
          ▼
     replicas/shards [VERIFY]
```

Talk through the actual changes you remember, not generic ones.

The lead-level answer should cover:

- horizontal stateless scaling;
- DB query/index optimization;
- connection pooling;
- caching if actually used;
- moving expensive work off synchronous request paths;
- CDN for media/static content;
- rate limiting;
- load testing;
- autoscaling;
- observability.

---

### Q2. “What was the bottleneck at 350, 1k, 5k, 10k?”

Do not invent exact progression.

Instead say:

> “I wouldn't claim that every concurrency level corresponded to a unique bottleneck unless I had measurements. We diagnosed bottlenecks through load testing and production telemetry rather than guessing.”

Then explain the methodology:

```text
Increase load
   ↓
measure:
CPU
memory
event-loop lag
DB latency
connection usage
p95/p99
external API latency
5xx
   ↓
identify first saturation point
   ↓
fix
   ↓
repeat
```

Possible examples:

- CPU saturated → horizontal scale;
- Mongo query latency → index/query change;
- connection pool saturated → pool sizing;
- external API bottleneck → caching/queue/circuit breaker;
- serialization/memory → optimize payloads.

---

### Q3. “How were NestJS services deployed? Stateless?”

If this matches your deployment:

> “The goal for the request-serving NestJS layer was statelessness: authenticated identity and durable domain state lived outside the process, so instances could be added or removed behind the load balancer.”

```text
Load Balancer
      │
 ┌────┼─────┐
 ▼    ▼     ▼
API1 API2  API3
 │    │     │
 └────┼─────┘
      ▼
shared durable state
```

State that should **not** live only in instance memory:

```text
user session
order state
ownership state
job status
```

Ephemeral local state is fine for:

```text
in-process caches
request scope
connection pools
```

provided loss is harmless.

**[VERIFY]** your actual AWS runtime—ECS, Kubernetes, EC2, Lambda, etc.—before naming it.

---

### Q4. “How was MongoDB modeled and indexed?”

Give one real query if you remember one.

The general answer pattern:

> “I started from the read/write access pattern, not from document aesthetics.”

Example:

```js
db.collectibles.find({
  userId: "...",
  status: "OWNED"
}).sort({
  createdAt: -1
})
```

Possible index:

```text
{ userId: 1, status: 1, createdAt: -1 }
```

Then explain:

> “The leftmost fields support equality predicates and the trailing field supports the requested sort.”

You identify bad queries through:

```text
explain()
docs examined
keys examined
execution time
slow query logs
APM
```

Do not claim that particular index existed unless true.

---

### Q5. “How did you verify 10,000 concurrent?”

This is critical.

A strong answer:

> “Concurrency is not the same thing as requests per second. I would explain exactly what the 10,000 figure represented—simultaneously connected or active users—and distinguish that from throughput.”

Load-test model:

```text
Ramp:
500
1k
2.5k
5k
10k

Hold period

Measure:
p50
p95
p99
error %
CPU/memory
DB latency
DB connections
dependency latency
```

Also test:

```text
steady load
burst
spike at launch
soak/endurance
```

If 10,000 came from actual production traffic rather than load testing, say that accurately.

---

### Follow-up: “Why MongoDB instead of PostgreSQL?”

Use workload characteristics.

Mongo strengths:

```text
document-oriented data
flexible nested schemas
rapidly evolving metadata
horizontal scale patterns
```

Postgres strengths:

```text
transactions
joins
relational integrity
SQL analytics
complex constraints
```

Answer:

> “I don't think of Mongo versus Postgres as a religion. I choose based on access patterns and consistency requirements. For highly relational financial/order state I generally prefer relational storage; for application-oriented document state with flexible nested structures, Mongo can be a better fit.”

---

### “Why AWS and GCP?”

Your resume explicitly says AWS/GCP and GCP Vision. Oscar Gonzalez - Lead Engineer …

A defensible explanation is:

> “The architecture was multi-cloud because different product capabilities existed in different providers—not because multi-cloud itself was a goal. For example, application infrastructure could run in AWS while GCP was used for services such as Vision. I would avoid duplicating equivalent core infrastructure across providers unless there were a concrete reliability or business reason.”

Cross-cloud concerns:

```text
IAM
network egress
latency
secret management
monitoring
failure boundaries
cost
```

---

### “What state prevented NestJS from being completely stateless?”

Answer:

> “A NestJS process can be stateless at the service-instance level even though the overall system is stateful. Durable state lives in MongoDB, blockchain state, caches or other stores. The instance still has ephemeral process state such as connection pools and in-flight requests, but no business-critical state should disappear if the instance is terminated.”

---

### “How did you handle DB connection pooling?”

General architecture:

```text
10 API instances
   │
each pool max = N
   │
   ▼
MongoDB cluster
```

The risk:

```text
autoscale to 100 instances
× pool 100
= 10,000 DB connections
```

So pool size must be designed together with autoscaling limits.

Monitor:

```text
active connections
connection wait time
query latency
CPU
replication lag
```

---

# 4. Vision API + vector search + Sanity

### Q1. “Walk me through the pipeline.”

Based on your resume and prior description:

```text
Sanity content/media
       │
       ▼
Processing trigger
       │
       ▼
Worker
       │
       ├── retrieve candidate images
       │
       ▼
GCP Vision
       │
       ├── labels / visual metadata
       │
       ▼
Normalized metadata
       │
       ▼
Embedding / vectorization
       │
       ▼
Vector search
       │
       ▼
Rank candidate thumbnails
       │
       ▼
Sanity writeback / human review
```

Explain:

> “Vision and vector retrieval solved different parts of the problem. Vision extracted semantic information from visual assets. Vector search let us compare candidate assets against content context semantically rather than relying on exact filenames or tags.”

---

### Q2. “What exactly did you send to Vision?”

Your resume only establishes GCP Vision integration, not the exact endpoint or feature set. So answer only what you actually remember.

If you used:

- label detection;
- object detection;
- OCR;
- safe-search analysis;

name the actual ones.

A safe answer:

> “We passed the media assets or their accessible representation to Vision and normalized the returned visual metadata into our processing pipeline. I don't want to invent the exact Vision feature if I don't remember it; the architectural role was automated enrichment of image metadata before ranking/selecting candidates.”

That is better than bluffing.

---

### Q3. “Where did vector search enter?”

Answer:

> “Vector search was for semantic retrieval/ranking. The system converted the relevant textual/visual context into an embedding representation and searched an indexed corpus of candidate assets. Rather than ‘does this image have an exact tag?’ the question became ‘which assets are semantically closest to the content context?’”

```text
Film context
   ↓
embedding
   ↓
vector query
   ↓
candidate image embeddings
   ↓
top-K
   ↓
reranking/business rules
```

---

### Q4. “Which model and vector DB?”

**[VERIFY]**.

Do not fabricate.

Say:

> “I remember the architecture and my responsibilities clearly, but I want to distinguish that from vendor-specific details I don't remember. The implementation used [actual provider/store]. Architecturally, we required an embedding model, persisted vectors with asset IDs/metadata, approximate nearest-neighbor retrieval, and a top-K ranking stage.”

If you remember exact vendor later, replace it.

---

### Q5. “How did you prevent a wrong thumbnail from automatically publishing?”

Use guardrails:

```text
retrieval
  ↓
score threshold
  ↓
business rules
  ↓
candidate set
  ↓
human review OR safe auto-publish class
```

Strong answer:

> “I would not make semantic similarity equivalent to correctness. The vector score is a candidate-generation signal. I would layer deterministic rules, confidence thresholds, asset eligibility, content status and—where the impact warranted it—human review before publication.”

Also maintain auditability:

```text
selected asset
model/version
score
source context
timestamp
override/user
```

---

# 5. Token / ICO launch flows

### Q1. “Design an ICO/token launch for a traffic spike.”

```text
Users
  │
  ▼
CDN / WAF
  │
  ▼
Rate limiter / waiting room
  │
  ▼
API Gateway
  │
  ▼
Stateless purchase APIs
  │
  ├── eligibility
  ├── limits
  ├── idempotency
  │
  ▼
Transactional operation store
  │
  ▼
Queue / worker
  │
  ▼
Blockchain
```

Critical principles:

- protect the write path;
- make purchase intent idempotent;
- persist state before asynchronous work;
- separate browsing from purchase;
- use atomic allocation for finite token inventory;
- reconcile blockchain outcomes.

---

### Q2. “How do you prevent over-purchasing or duplicates?”

Use:

```text
per-user limits
atomic DB condition
unique idempotency key
```

For example:

```sql
UPDATE allocation
SET purchased = purchased + :amount
WHERE user_id = :user
  AND purchased + :amount <= max_allowed;
```

or transactionally lock the relevant allocation.

Then:

```text
Idempotency-Key: launch123:user456:request789
```

Retry returns same result instead of another purchase.

---

### Q3. “DB or blockchain as source of truth?”

Answer:

> “For actual on-chain ownership, blockchain is authoritative. But application state still needs to track the lifecycle of the user's operation. I would separate ‘canonical chain ownership’ from ‘application workflow state.’”

```text
Application:
PENDING / SUBMITTED / CONFIRMED / FAILED

Blockchain:
canonical finalized ownership/transaction
```

Reconciliation bridges them.

---

### Q4. “Blockchain succeeded but backend timed out.”

Never immediately reissue.

```text
operation_id
transaction hash if available
request fingerprint
```

Reconciler:

```text
unknown outcome
    ↓
query chain
    │
    ├── found → CONFIRMED
    └── absent after safe criteria → retry/fail
```

This is the classic **ambiguous timeout problem**.

---

### Q5. “How did you deploy something this high risk?”

A Lead answer should include:

```text
pre-production load test
feature flags
staging rehearsal
deployment freeze window
canary / progressive rollout where applicable
rollback
dashboards
alerting
runbook
on-call ownership
post-launch reconciliation
```

For blockchain contract behavior, rollback may be fundamentally different because on-chain effects may be irreversible.

That should be acknowledged.

---

# FREQUENCE + MADHIVE

Your resume has five separate Frequence/Madhive claims covering acquisition-oriented engineering maturity, leadership across 30+ engineers/QAs, Angular framework architecture, AI-assisted testing with quantified results, and high-variation workflow automation. Oscar Gonzalez - Lead Engineer …

# 6. Platform execution / engineering maturity

### Q1. “What did engineering maturity concretely mean?”

Answer in concrete categories:

```text
Before                       Improved
------                       --------
inconsistent UI         →    shared design system
manual regression       →    automated E2E
weak PR conventions     →    standardized reviews
coupled widgets         →    configurable framework
ad hoc quality          →    CI gates / observability
```

Interview answer:

> “I would define maturity by measurable engineering properties: predictable releases, reusable architecture, automated regression coverage, consistent review standards, observability and a framework that multiple teams could extend without repeatedly rebuilding the same patterns.”

---

### Q2. “Draw omnichannel architecture.”

Your known widget examples are valuable:

```text
                         Strategy / Campaign
                                │
                                ▼
                         Workflow Engine
                                │
             ┌──────────────────┼──────────────────┐
             ▼                  ▼                  ▼
         Planning           Activation         Reporting
             │
      Config-driven UI
             │
    ┌────────┼────────────┐
    ▼        ▼            ▼
Geography Audience   Product Selection
widget    widget         widget
                      │
               CTV / Radio / etc.
```

A backend could expose normalized strategy configuration:

```text
Product configuration
       ↓
workflow definition
       ↓
widget configuration
       ↓
frontend renders
```

The central architectural idea:

> “Product variation belonged in configuration and extension points rather than hundreds of hard-coded `if product === ...` branches.”

---

### Q3. “What makes AdTech workflow systems difficult to scale?”

Several dimensions:

**Configuration scale**

```text
customer × product × workflow-state × feature flags
```

**Data scale**

- campaigns;
- targeting;
- impressions;
- reporting.

**Integration scale**

- publishers;
- CTV providers;
- radio;
- third parties.

**Organizational scale**

- many engineers altering shared workflow infrastructure.

Lead answer:

> “At Frequence, ‘scale’ was not only requests per second. Configuration complexity and safe extensibility were major scaling problems.”

---

### Q4. “What did you personally contribute?”

Use concrete examples you can defend:

> “My strongest personal contributions were around the shared frontend framework, widget architecture, test automation, design-system/PR standards and engineering direction. For example, I worked with configurable geography, audience and product-selection workflows and helped create automation around product-specific workflow paths.”

Then specify actual code/module names if remembered.

---

### Q5. “What would an acquisition technical diligence team examine?”

Likely:

```text
architecture maintainability
security
test coverage
deployment process
observability
technical debt
single points of failure
scaling characteristics
data ownership
dependency/licensing risk
bus factor
documentation
```

Answer:

> “I wouldn't claim my work caused the acquisition, but the areas I contributed to—repeatable testing, shared framework architecture, documented engineering standards and product infrastructure—are exactly the kinds of technical-risk areas that matter during scaling and diligence.”

That framing is accurate and defensible.

---

# 7. Technical direction across 30+ engineers/QAs

### Q1. “How can you influence 30+ engineers?”

Not through reviewing every line.

```text
Lead
 │
 ├── architecture patterns
 ├── RFCs/standards
 ├── team leads
 ├── shared libraries
 ├── CI enforcement
 └── recurring technical forums
```

Say:

> “The goal was to make the right architecture the easiest architecture to follow. I used shared patterns, examples, code review standards and delegated ownership rather than requiring every implementation decision to come through me.”

---

### Q2. “How were architecture decisions proposed and enforced?”

A mature flow:

```text
Problem
 ↓
RFC / design proposal
 ↓
alternatives + tradeoffs
 ↓
review
 ↓
decision / ADR
 ↓
implementation
 ↓
automated enforcement where possible
```

Examples:

- ESLint;
- TypeScript compiler;
- shared APIs;
- CI tests;
- package boundaries;
- Storybook;
- PR templates.

Lead principle:

> “Policy enforced only through human memory does not scale.”

---

### Q3. “What PR standard changed quality?”

Use a real standard.

Possible structure:

> “A PR needed to explain the user/system behavior being changed, testing evidence, risk area and any architectural implications—not just contain code. For critical changes, we required regression coverage.”

If you had specific PR templates/checklists, use them.

Avoid claiming specific gates you didn't use.

---

### Q4. “What belongs in a shared design system?”

Shared when:

```text
reused across products
stable semantics
brand/UX consistency important
```

Examples:

```text
Button
Modal
Form controls
Typography
Tables
Layout primitives
```

Product-specific:

```text
campaign planner
targeting workflow
complex domain widget
```

unless those domain widgets themselves become platform abstractions.

A strong phrase:

> “Reuse should occur at the correct abstraction level; premature generalization is just another form of coupling.”

---

### Q5. “Break down a large product request.”

Example:

```text
Feature:
Add a new targeting capability
```

Breakdown:

```text
Domain/API contract
   │
   ├── backend data model
   ├── validation
   ├── API
   │
   ├── frontend widget
   ├── workflow configuration
   │
   ├── unit/integration tests
   ├── E2E workflow
   │
   ├── telemetry
   └── rollout / feature flag
```

Then establish dependencies and parallelizable tracks.

---

### Follow-up: “How did you handle disagreement?”

> “I tried to convert disagreement into explicit competing constraints. If two engineers disagree, I ask what each design optimizes for—latency, extensibility, delivery time, isolation, operational cost—and then use evidence or a small prototype where necessary.”

---

### “How did you prevent yourself becoming the bottleneck?”

> “I standardized repeatable decisions and reserved direct involvement for high-blast-radius architectural decisions.”

```text
Repeatable decision
→ documented pattern

High-risk new decision
→ architecture review
```

---

### “How did offshore teams get sufficient context?”

Strong practices:

- written acceptance criteria;
- architectural diagrams;
- API contracts;
- Storybook;
- async technical docs;
- clear ownership;
- recorded demos;
- overlap windows for ambiguity;
- avoid ticket-only communication.

---

# 8. Angular widget framework

### Q1. “What was a widget?”

Use your real examples.

> “A widget was an extensible domain UI unit used inside configurable workflow states. Geography might represent geofence/location configuration, Audience represented demographic/segment selection, and Product Selection controlled products such as CTV or Radio.”

Conceptually:

```ts
interface WorkflowWidget {
  id: string;
  initialize(config): void;
  validate(): ValidationResult;
  serialize(): Payload;
}
```

Exact interface **[VERIFY]**; use it conceptually unless you remember actual code.

---

### Q2. “How did the system decide which widgets appeared?”

Best architecture:

```text
Strategy type
     │
     ▼
Workflow configuration
     │
     ▼
Current workflow status
     │
     ▼
Widget registry
     │
     ▼
Geography + Audience + Product...
```

This avoids:

```ts
if (client === A && product === CTV && status === X) ...
```

everywhere.

If your production architecture was configuration-driven, emphasize this strongly.

---

### Q3. “How did widgets communicate?”

Prefer controlled contracts:

```text
Widget
   ↓
shared workflow state/service
   ↓
observable state
   ↓
other widgets
```

In Angular/RxJS this may involve:

- services;
- observables;
- state containers;
- typed events;
- inputs/outputs.

Avoid hidden direct component coupling.

---

### Q4. “How did you version framework changes?”

Strategies:

```text
backward-compatible API contracts
feature flags
configuration versions
schema migrations
deprecation windows
shared component semantic versioning
```

For saved workflow data:

```text
schema_version: 3
```

Deserializer can migrate older payloads.

---

### Q5. “How would you migrate it to React?”

Preserve domain architecture:

```text
configuration schema
workflow state model
API contracts
validation logic
domain types
```

Rewrite:

```text
Angular components
Angular DI
RxJS-specific UI plumbing
Angular directives
```

React might use:

```text
component registry
hooks
context/store
schema-driven rendering
```

The key insight:

> “A good domain architecture should outlive the frontend framework.”

---

# 9. Playwright/Jest/Claude/Datadog testing

### Q1. “Walk me through an actual test.”

Use your strategy-bundle example.

```text
Fixture:
create strategy bundle = CTV

Expected workflow:
Status A → widgets X/Y
Status B → widgets X/Z
Status C → widgets...
```

Then:

```text
Arrange
→ create/configure strategy

Act
→ navigate workflow
→ change status / inputs

Assert
→ expected widgets
→ API payload
→ persisted state
→ final status
```

A strong interview response includes **one bug actually caught**, if you remember one.

---

### Q2. “Where was Claude multimodal used?”

Be exact. If it evaluated screenshots/visual output, say so. If not, don't imply it.

General distinction:

```text
Playwright
= deterministic browser automation

Jest
= deterministic assertions/unit logic

Claude multimodal
= semantic/visual reasoning where deterministic selectors are insufficient
```

Potential multimodal role:

```text
screenshot
   ↓
multimodal evaluator
   ↓
semantic visual assessment
```

**[VERIFY exact usage].**

---

### Q3. “Why AI instead of normal assertions?”

Correct answer:

> “I would never replace a deterministic assertion with an LLM when a deterministic check is reliable. AI was useful only where correctness was semantic or visual and difficult to encode as a stable selector/value assertion.”

For example:

```text
"button exists"
→ Playwright

"page layout visually reflects intended configuration"
→ potentially multimodal
```

---

### Q4. “How did tests run in CI?”

**[VERIFY CI provider].**

Lead-level pipeline:

```text
PR
 ↓
install/build
 ↓
unit tests
 ↓
integration tests
 ↓
deploy ephemeral/test environment
 ↓
Playwright suites
 ↓
artifacts:
 screenshots
 videos
 traces
 logs
 ↓
block merge/release for critical failures
```

Datadog can correlate application telemetry with failing workflows.

---

### Q5. “Explain 50% bug reduction and 60% manual QA reduction.”

This one must be factual.

Prepare:

```text
baseline period
after period
bug classification
manual QA hours/cycles
same denominator
```

Good answer:

> “I would define the metrics before presenting them. Production bug reduction was based on [VERIFY exact tracking source/time period]. Manual QA reduction was based on [VERIFY QA execution time / number of manually executed scenarios]. The important point is that I don't claim those percentages from intuition; they came from comparing the prior process to the automated process.”

If you can't substantiate the exact measurement, consider softening the resume later.

---

### “How did you handle flaky tests?”

Four buckets:

```text
test bug
application race
environment instability
actual product defect
```

Use:

- deterministic fixture setup;
- API-driven setup instead of UI setup;
- no arbitrary sleeps;
- wait on explicit conditions;
- isolate data;
- capture traces/screenshots;
- quarantine only temporarily;
- track flake rate.

Never normalize:

```text
retry 5 times until green
```

as a permanent solution.

---

### “How did you stop LLM nondeterminism from creating false failures?”

Use LLM result as:

```text
signal
not authority
```

unless confidence/repeatability is sufficient.

Possible design:

```text
deterministic assertions
      +
LLM visual evaluation
      ↓
structured result schema
      ↓
confidence
      ↓
human review or retry
```

Pin model/version where possible and store evaluation artifacts.

---

### “What did Datadog contribute?”

Datadog provides **runtime evidence** beyond the test result:

```text
failed browser step
       ↓
trace ID
       ↓
API trace
       ↓
DB query
       ↓
error/log
```

Useful signals:

- p95/p99;
- error rate;
- API traces;
- logs;
- frontend telemetry;
- release correlation.

---

# 10. High-variation workflow validation

### Q1. “What made workflows high variation?”

Use your actual product examples:

```text
CTV strategy
Spectrum TV strategy
Radio strategy
```

Each could have different:

```text
statuses
widgets
required inputs
validation
transitions
```

So one application might represent many mini-UX workflows.

---

### Q2. “How do you avoid combinatorial explosion?”

Do not test every Cartesian product.

Use:

```text
equivalence classes
risk-based testing
pairwise combinations
critical-path coverage
boundary cases
```

For example:

```text
products × status × audience × geography × permissions
```

could explode into millions.

Instead model **meaningful behavioral partitions**.

---

### Q3. “How select representative configurations?”

Criteria:

```text
highest traffic
highest revenue/risk
historically buggy
unique code paths
boundary conditions
representative configuration families
```

You can maintain a test matrix.

---

### Q4. “How structure fixtures?”

Avoid:

```text
hard-coded customer 123
hard-coded IDs
```

Use fixture factories:

```ts
createStrategy({
  product: 'CTV',
  customerConfig: ...,
  workflowStatus: ...
})
```

Then tests reason from declared configuration.

---

### Q5. “CTV vs Spectrum TV vs Radio?”

Use a common test harness with product-specific expectations:

```text
StrategyDefinition
   │
   ├── product
   ├── statuses
   ├── widgetsByStatus
   └── validations
          │
          ▼
Generic workflow runner
```

This avoids maintaining three completely independent test architectures.

---

# TICKETSOCKET & ICECREAMSOCIAL

Your resume contains five distinct claims: AngularJS→React/TypeScript, configurable dashboards/white-label workflows, PostgreSQL/event-processing optimization, AWS scaling from 350 to 10,000+, and large-codebase testing/API documentation. Oscar Gonzalez - Lead Engineer …

# 11. AngularJS → React + TypeScript

### Q1. “How do you migrate without freezing development?”

Use **strangler migration**.

```text
Existing AngularJS App
       │
       ├── legacy route A
       ├── legacy route B
       │
       ├── NEW React route C
       └── NEW React route D
```

Migrate incrementally:

```text
shared shell
 ↓
route/component boundary
 ↓
new development in React
 ↓
replace legacy surfaces gradually
```

Do not big-bang rewrite unless compelling reason.

---

### Q2. “How did AngularJS and React coexist?”

Potential approaches:

```text
route-level isolation
React mounted inside AngularJS shell
AngularJS embedded around React
shared API layer
```

Use your actual implementation **[VERIFY]**.

Strong answer:

> “The important architectural decision was to choose clear migration boundaries so the two frameworks didn't continuously reach into each other's component internals.”

---

### Q3. “How did you handle shared state?”

Ideal transitional design:

```text
AngularJS ──┐
            ▼
       framework-neutral state/API
            ▲
React ──────┘
```

Avoid state being owned by one framework if the other needs it.

Options:

- URL;
- backend;
- shared JS module;
- event interface;
- temporary state adapter.

---

### Q4. “What did TypeScript materially improve?”

Examples:

```text
API payload contracts
shared domain models
component props
nullable-state handling
refactoring safety
IDE navigation
```

Strong answer:

> “TypeScript's biggest value in a migration wasn't catching syntax errors; it was making cross-module contracts explicit so we could refactor legacy assumptions safely.”

---

### Q5. “How did Storybook help?”

```text
Design ↔ Storybook ↔ Engineering
```

Benefits:

- isolated states;
- shared component vocabulary;
- visual review;
- edge cases;
- documentation;
- reusable design-system components.

Could integrate screenshot/visual regression if actually done.

---

### “Why React?”

Frame around project context, not fashion:

- ecosystem;
- team familiarity;
- reusable component model;
- TypeScript;
- incremental migration feasibility.

---

### “Why not modern Angular?”

Answer:

> “That was a valid alternative. The decision should consider migration path, team skills, desired component ecosystem and product direction. Modern Angular is not inherently incapable. The key was selecting an architecture that reduced legacy coupling and allowed incremental delivery.”

---

### “How did you measure improvement?”

Potential evidence:

```text
test coverage
defect rate
component reuse
lead time
PR size
time to deliver screens
Storybook adoption
```

Only claim measured values you can substantiate.

---

# 12. Configurable dashboards and white-label workflows

### Q1. “Design the configuration system.”

```text
Tenant / Merchant
      │
      ▼
Tenant Configuration
      │
      ├── brand
      ├── enabled modules
      ├── permissions
      ├── payment provider
      └── feature flags
             │
             ▼
       Dashboard Composer
             │
      ┌──────┼─────────┐
      ▼      ▼         ▼
   Events Inventory Influencers
```

Avoid cloning code per client.

---

### Q2. “How determine branding, permissions and widgets?”

Example:

```text
tenant_id
   ↓
configuration service/cache
   ↓
{
  theme,
  enabled_features,
  role_permissions,
  modules
}
```

Server must still enforce permissions; frontend configuration is not security.

---

### Q3. “How isolate tenant data?”

Every request carries authenticated tenant context:

```text
JWT
{
  sub,
  tenant_id,
  roles
}
```

Backend:

```sql
WHERE tenant_id = :authenticatedTenant
```

Never:

```text
tenant_id supplied by client
```

as the trusted authorization source.

At scale, additional isolation may include:

- tenant-aware DB indexes;
- partitioning;
- separate databases for high-compliance tenants.

---

### Q4. “How handle roles?”

RBAC example:

```text
Customer
→ own tickets/orders

Cashier
→ box-office purchase

Event manager
→ event/inventory operations

Merchant admin
→ configuration/reporting

Platform support
→ explicitly scoped support operations
```

Domain authorization must happen backend-side.

---

### Q5. “Real-time inventory vs historical reporting: same API?”

Generally no.

```text
Transactional inventory path
→ strongly consistent / low latency

Historical analytics
→ read replica / warehouse / preaggregation
```

Don't let a 5-year report query compete with seat-reservation writes.

---

# 13. PostgreSQL, stored procedures, triggers, webhooks, transactions

### Q1. “Give me a real query/index improvement.”

Use a real TicketSocket query if remembered.

Example structure:

```sql
SELECT ...
FROM orders
WHERE event_id = ?
  AND status = ?
ORDER BY created_at DESC
LIMIT 100;
```

Potential index:

```sql
(event_id, status, created_at DESC)
```

Explain:

> “I would confirm improvement with `EXPLAIN ANALYZE`, comparing scan type, rows examined, sort behavior and execution time before and after.”

Do not present this exact query as historical unless true.

---

### Q2. “Why stored procedures/triggers?”

Good candidates:

```text
must happen atomically with DB change
data-integrity logic
legacy cross-application consistency
highly data-local operation
```

Bad candidates:

```text
complex external API orchestration
logic developers cannot discover
long-running network calls
```

---

### Q3. “Downsides of triggers?”

- hidden side effects;
- debugging complexity;
- surprising writes;
- difficult migrations;
- harder unit testing;
- cascading behavior.

Mitigation:

```text
documented triggers
narrow responsibility
integration tests
DB migration versioning
monitoring
```

---

### Q4. “How avoid DB update + event publication mismatch?”

Use **transactional outbox**:

```text
BEGIN

UPDATE order

INSERT outbox_event

COMMIT
```

Then:

```text
Outbox Publisher
      ↓
Broker
```

This avoids:

```text
DB succeeds
event publish fails
```

dual-write inconsistency.

If TicketSocket used a different mechanism, answer with the actual one.

---

### Q5. “Duplicate/out-of-order Square webhook?”

Canonical state machine:

```text
IN_PROCESS
    ↓
COMPLETED
    ↓
REFUND_REQUESTED
    ↓
REFUNDED
```

Store:

```text
provider_event_id
provider_object_id
provider_version / occurred_at
current_state
```

Consumer logic:

```text
signature valid?
   ↓
event already processed?
 yes → no-op
 no
   ↓
is this event newer/legal?
   ↓
transactional update
```

Never let:

```text
old COMPLETED
```

overwrite:

```text
REFUNDED
```

---

# 14. AWS ticketing scaling 350 → 10,000+

### Q1. “Draw before and after.”

Conceptual:

```text
BEFORE

Users
 ↓
App Server(s)
 ↓
PostgreSQL
```

Scaled design:

```text
                         Users
                           │
                           ▼
                     CDN / WAF
                           │
                           ▼
                  Load Balancer / Edge
                           │
                           ▼
                Stateless Application Tier
                 ┌────────┼─────────┐
                 ▼        ▼         ▼
                API1     API2      APIN
                           │
             ┌─────────────┼──────────────┐
             ▼             ▼              ▼
           Redis       PostgreSQL     Async Queue
                         │               │
                         ▼               ▼
                   replicas/etc       workers
```

And for hot seated events:

```text
Waiting room
    ↓
Admission control
    ↓
Reservation API
    ↓
atomic seat store
```

Exact AWS components **[VERIFY]**.

---

### Q2. “What does JWT-based service allocation mean?”

This wording is unusual enough that you should prepare it carefully.

If what you mean is white-label/tenant/service routing, explain:

```text
Auth0 / issuer
      │
      ▼
JWT claims
{
 user,
 tenant/client,
 scopes
}
      │
      ▼
Gateway/backend
      │
      ├── authenticate
      ├── authorize tenant
      └── route/use correct service configuration
```

JWT signature:

```text
issuer private key signs
services validate with public key/JWKS
```

Security checks:

```text
signature
iss
aud
exp
scope/role
tenant association
```

Do not say JWT itself magically load-balances servers.

If “service allocation” meant something else historically, clarify it before interview.

---

### Q3. “How prevent double-selling a seat?”

This is a critical answer:

```text
AVAILABLE
    │ atomic
    ▼
HELD
    │ payment succeeds
    ▼
SOLD
```

Atomic SQL example:

```sql
UPDATE seats
SET status = 'HELD',
    hold_id = :hold,
    expires_at = :expiry
WHERE event_id = :event
  AND seat_id = :seat
  AND status = 'AVAILABLE';
```

Then:

```text
rowsAffected = 1 → winner
rowsAffected = 0 → unavailable
```

Do not use cache state alone to guarantee ownership.

---

### Q4. “One million users arrive at once.”

```text
1,000,000 users
      ↓
CDN/WAF/bot controls
      ↓
Virtual waiting room
      ↓
controlled admission
      ↓
rate limiter
      ↓
cached seat browsing
      ↓
reservation service
      ↓
strongly consistent inventory
```

This transforms demand into a safe write rate.

---

### Q5. “How validate 10,000 concurrent?”

Describe:

- load generator;
- realistic user journeys;
- ramp/spike/soak;
- p95/p99;
- error rate;
- DB CPU/connections;
- application CPU;
- queue lag;
- external payment latency.

A lead says:

> “I didn't consider a test successful simply because the service stayed up; it needed to meet latency and error SLOs under load.”

---

### “Why Redis?”

Good uses:

```text
seat-map cache
rate limits
session/admission state
short-lived holds [depending design]
hot event metadata
```

### “Why not Redis alone as seat source of truth?”

Because the safety invariant is:

```text
seat can be sold only once
```

and you want durable transactional semantics.

Redis failure/eviction/failover should not permit duplicate ownership.

A robust design uses the transactional database or another strongly consistent authoritative store for final allocation.

---

# 15. Testing to 70% + Redocly/Swagger

### Q1. “How do you get 90k lines from ~0 to 70%?”

Don't attempt all modules equally.

```text
1. identify critical paths
2. add test seams
3. regression tests around bugs
4. new code must include tests
5. gradually raise threshold
```

Focus first on:

- payments;
- orders;
- ticket inventory;
- authentication;
- integrations.

---

### Q2. “Which tests first?”

Usually:

```text
Unit
→ cheap core business logic

Integration
→ DB/API boundaries

E2E
→ highest-risk customer workflows
```

For a legacy system, integration tests can provide more initial value than trying to unit-test every deeply coupled class.

---

### Q3. “Global threshold or changed code?”

A good migration approach:

> “I prefer ratcheting. Don't allow the codebase to get worse while gradually improving the baseline.”

For example:

```text
existing global coverage = X
new/changed code = higher threshold
```

Then ratchet global threshold upward.

---

### Q4. “How test legacy code without DI?”

Techniques:

- characterization tests;
- wrap external dependencies;
- extract pure functions;
- introduce interfaces gradually;
- integration test at stable boundaries;
- avoid giant rewrite solely for tests.

---

### Q5. “How did Swagger/OpenAPI do more than documentation?”

Possibilities:

```text
API contract
   ├── interactive docs
   ├── partner onboarding
   ├── generated clients
   ├── validation
   ├── contract tests
   └── change review
```

Only claim the uses you actually implemented.

---

### “Why 70% instead of 100%?”

> “Coverage is a risk signal, not the goal. 100% can incentivize low-value tests. I cared more that business-critical branches and integration boundaries were exercised than that getters and trivial plumbing increased a percentage.”

---

# VISA

Your resume contains two Visa claims: Angular/D3 infrastructure-risk visualization and a real-time Angular/Node vendor portal. Oscar Gonzalez - Lead Engineer …

# 16. Angular/D3 risk dashboard

### Q1. “What was the data pipeline?”

A typical structure:

```text
Infrastructure data
      │
      ▼
Data science / processing
      │
      ▼
Backend API / read model
      │
      ▼
Angular application
      │
      ▼
D3 visualizations
```

Do not say the browser processed raw Visa network telemetry unless that was true.

---

### Q2. “Raw operational data or aggregated read model?”

For dashboard performance, prefer:

```text
operational/raw data
      ↓
processing
      ↓
dashboard-oriented aggregate
      ↓
frontend
```

because dashboards usually need:

```text
fast predictable reads
precomputed risk metrics
stable schema
```

rather than large raw scans.

---

### Q3. “Tens of thousands of D3 nodes?”

Techniques:

```text
aggregation
clustering
level-of-detail
virtualization
Canvas/WebGL instead of SVG at extreme sizes
filtering
incremental rendering
```

D3 doesn't require SVG; it can drive other rendering approaches.

---

### Q4. “Where was risk calculated?”

The clean separation is:

```text
Data science/backend
→ computes risk

Frontend
→ visualizes risk
```

Do not embed authoritative risk models in browser JavaScript.

If some transformation happened client-side, distinguish visualization transforms from risk scoring.

---

### Q5. “How did dashboard reduce incidents by 30%?”

You need your actual metric.

Prepare:

```text
incident definition
baseline period
post-launch period
same infrastructure population?
confounding changes?
```

Good Lead framing:

> “I would avoid claiming pure causality if other improvements were happening simultaneously. The dashboard contributed by surfacing exposure earlier; the measured incident reduction during the relevant period was 30%+.”

---

### Follow-up: “Would 15-minute stale risk data be acceptable?”

Answer depends on use case.

> “I would derive freshness from the operational decision. If this is strategic risk posture, 15 minutes may be fine. If it's active incident response, it may be unacceptable.”

Architecture is driven by SLO:

```text
15-minute acceptable
→ batch/aggregate

seconds required
→ streaming/events
```

---

# 17. Real-time vendor portal

### Q1. “What does real-time mean?”

Be precise.

If it was polling, say polling.

If WebSockets, say WebSockets.

Architecture options:

```text
Browser
  │
WebSocket / SSE
  │
Node
```

Real-time can mean:

```text
state changes appear without reload
```

but interviewer will ask *how*.

**[VERIFY exact mechanism].**

---

### Q2. “Draw vendor approval workflow.”

```text
SUBMITTED
    ↓
SECURITY_REVIEW
    │
    ├── REJECTED / CHANGES_REQUIRED
    │
    ▼
PRIVACY_REVIEW
    ↓
PROCUREMENT
    ↓
APPROVED
```

Potential parallel approvals:

```text
              ┌── Security ──┐
Submitted ────┼── Privacy ───┼── Final Decision
              └── Procurement┘
```

Persist workflow state centrally.

---

### Q3. “How model independent departmental approvals?”

Schema:

```text
request
approval_step
approver/role
status
timestamp
comment
```

Workflow engine determines:

```text
ALL_REQUIRED
ANY_REQUIRED
SEQUENTIAL
PARALLEL
```

Avoid encoding every flow as frontend conditionals.

---

### Q4. “How maintain audit history?”

Use append-only audit records:

```text
request_id
actor_id
action
old_state
new_state
timestamp
metadata
```

Never overwrite history when status changes.

Security:

- RBAC;
- immutable/audited privileged actions;
- timestamps;
- authenticated actor IDs.

---

### Q5. “How measure 80% reduction?”

Again, actual measurement:

```text
Before:
submission → approval = X days

After:
submission → approval = Y days

(X-Y)/X
```

Explain what changed:

- centralized status;
- automatic notifications;
- reduced email/manual handoffs;
- fewer duplicate data-entry steps.

---

# PERSONAL PROJECT — AGENTIC ENGINE

The resume explicitly describes goal→DAG compilation using LLM critics/evals, strict schemas, beam search, MCP, RAG, XState, TypeScript/Node and Python. Oscar Gonzalez - Lead Engineer …

# 18. Agentic Engine

### Q1. “How does natural language become a DAG?”

Architecture:

```text
User Goal
   │
   ▼
Intent / Goal Parser
   │
   ▼
Candidate Planner
   │
   ▼
Structured CandidatePlan
   │
   ▼
JSON Schema Validation
   │
   ▼
Critics / Evaluators
   │
   ▼
Search / Beam Selection
   │
   ▼
Validated DAG
   │
   ▼
Executor
```

Node model:

```ts
interface WorkflowNode {
  id: string;
  type: string;
  dependencies: string[];
  inputSchema: object;
  outputSchema: object;
  tool?: string;
}
```

Conceptual only; map to your actual schema.

---

### Q2. “Why DAG? What about loops?”

DAG gives:

```text
explicit dependencies
parallelizable nodes
cycle detection
deterministic scheduling
visualizability
```

Loops can be modeled at a higher level:

```text
state machine
   ↓
execute DAG iteration
   ↓
evaluate
   ├── complete
   └── another iteration
```

or as a bounded retry state rather than introducing arbitrary graph cycles.

This is one reason XState + DAG can coexist.

---

### Q3. “Where do critics/evals enter?”

Possible evaluation layers:

```text
Candidate plan
      │
      ├── feasibility critic
      ├── completeness critic
      ├── safety/schema critic
      └── cost/efficiency critic
             │
             ▼
           score
```

During execution:

```text
node result
   ↓
result evaluator
   ↓
accept / retry / replan
```

The important distinction:

> “Planning evaluation and execution evaluation are separate problems.”

---

### Q4. “Explain beam search.”

Instead of committing to first plan:

```text
Goal
 │
 ├── Candidate A
 ├── Candidate B
 ├── Candidate C
 └── Candidate D
```

Score them:

```text
coverage
feasibility
tool availability
risk
cost
```

Keep top `k`.

Each expands:

```text
A → A1, A2, A3
B → B1, B2
```

Again keep top `k`.

Stop when:

```text
complete valid plan
score threshold
max depth
budget exhausted
```

Be ready to name your actual beam width/scoring config if implemented.

---

### Q5. “How do JSON schemas protect against LLM nondeterminism?”

Schema prevents structural garbage:

```json
{
  "nodeId": "...",
  "tool": "...",
  "inputs": {}
}
```

It can enforce:

```text
required properties
enums
types
additionalProperties=false
```

But schema cannot guarantee semantic correctness.

Therefore:

```text
Schema validity
       +
semantic validation
       +
tool/domain validation
```

are all needed.

---

### Q6. “XState vs DAG?”

A strong distinction:

> “The DAG represents dependency structure between pieces of work. XState represents lifecycle/control state.”

```text
DAG:
A → B
A → C
B,C → D
```

XState:

```text
IDLE
 ↓
PLANNING
 ↓
VALIDATING
 ↓
EXECUTING
 ├── RETRYING
 ├── REPLANNING
 └── COMPLETED
```

They solve orthogonal problems.

---

### Q7. “How does MCP fit?”

Conceptual:

```text
Planner
   │
   ▼
Tool Registry
   │
   ├── MCP server A
   ├── MCP server B
   └── native tool C
```

For each tool:

```text
name
description
input schema
permissions
capabilities
```

Executor:

```text
validate tool allowed
validate input
invoke
validate output
persist result
```

Security must include:

- explicit tool allowlists;
- user/tenant permission;
- scoped credentials;
- secret isolation;
- no arbitrary tool execution solely because the LLM requested it.

---

### Q8. “Explain the RAG pipeline.”

```text
Documents
   ↓
chunk
   ↓
embed
   ↓
vector index

Query
   ↓
embed
   ↓
retrieve top-K
   ↓
optional keyword/hybrid retrieval
   ↓
rerank
   ↓
context
   ↓
LLM
```

For a source-grounded system, persist:

```text
document ID
chunk ID
score
citation
version
```

so answers can point back to evidence.

---

### Q9. “Node 8 fails after 7 side effects.”

This is distributed workflow recovery.

Each node needs:

```text
execution_id
status
attempt
idempotency_key
result
side_effect metadata
```

Then classify nodes:

```text
pure/retryable
idempotent side-effect
compensatable side-effect
irreversible
```

Example Saga:

```text
A success
B success
C success
D fails
   ↓
compensate C
compensate B
or resume from D
```

Do not rerun successful side-effecting nodes blindly.

---

### Q10. “How horizontally scale thousands of workflows without executing a node twice?”

```text
Workflow DB
     │
     ▼
Scheduler
     │
     ▼
Ready-node queue
     │
   ┌─┴───────┐
   ▼         ▼
Worker A   Worker B
```

Use:

```text
leases
atomic claim
idempotency key
execution version
heartbeat
lease expiry
```

Example:

```sql
UPDATE node_execution
SET worker_id = :worker,
    lease_until = ...
WHERE id = :node
  AND status = 'READY'
  AND lease is available;
```

Only one worker wins.

Even if queue delivery is duplicate:

```text
consumer A
consumer B
```

the durable claim prevents duplicate execution.

For external actions, use a downstream idempotency key too.

---

# THE 10 CROSS-CUTTING QUESTIONS THEY CAN ASK ABOUT ANY BULLET

These were also questions in the previous response, so they should be part of your preparation.

## 1. “Draw it.”

Always start with:

```text
CLIENT
 ↓
INGRESS
 ↓
COMPUTE / SERVICE
 ↓
STATE
 ↓
ASYNC INTEGRATIONS
```

Then add:

```text
auth
cache
queue
external service
monitoring
```

Do not immediately draw 25 AWS icons.

Start from data flow and invariants.

---

## 2. “What did you personally own?”

Use four buckets:

> “I personally designed X, implemented Y, led/reviewed Z, and the broader team owned W.”

This is much more credible than turning every organizational achievement into individual authorship.

---

## 3. “Why that technology?”

Use this pattern every time:

> “The requirements were A/B/C. I considered X and Y. X optimized for __, Y optimized for __. We chose X because the dominant requirement was __. The tradeoff was __.”

Example:

```text
SQS FIFO vs Kafka

Need:
ordering
retries
DLQ
modest event rate

No need:
replay
many consumer groups
high-throughput stream processing

→ SQS FIFO
```

That is stronger than “because AWS.”

---

## 4. “What was the scale?”

Know these dimensions separately:

```text
concurrent users
requests/sec
events/sec
data volume
tenants
DB size
latency SLO
queue depth
```

Never substitute one for another.

`10,000 concurrent` does **not** automatically mean `10,000 requests/sec`.

---

## 5. “What happens when it fails?”

For every architecture, mentally walk:

```text
DB down
cache down
queue delayed
external API timeout
duplicate event
out-of-order event
instance crash
deployment bad
network partition
```

A Lead Engineer should design failure semantics, not just success flow.

---

## 6. “How do you prevent duplicates?”

Common mechanisms:

```text
idempotency key
unique DB constraint
processed_event table
source version
conditional update
transactional outbox
```

Remember:

> At-least-once delivery means consumers must assume duplicates.

---

## 7. “What consistency do you need?”

Use strong consistency only where the invariant requires it.

Examples:

```text
Seat allocation       → strong
Payment/order state   → strong/idempotent
Analytics             → eventual
Search index          → eventual
Email                 → eventual
Cached seat map       → eventual
```

This demonstrates mature distributed-system judgment.

---

## 8. “How do you observe it?”

Use the golden signals:

```text
latency
traffic
errors
saturation
```

Plus domain signals:

```text
queue lag
DLQ depth
hold expiration
payment failure
reward backlog
indexing freshness
```

For latency:

```text
p50
p95
p99
```

not just average.

Distributed tracing:

```text
trace_id
   ↓
API Gateway span
   ↓
Service span
   ↓
DB/external dependency span
```

---

## 9. “How is it secured?”

A strong security checklist:

```text
Authentication
→ who are you?

Authorization
→ what may you do?

Tenant isolation
→ whose data may you access?

Transport security
→ TLS

Secrets
→ secret manager/KMS

Data
→ encryption at rest

APIs
→ rate limits/validation

Webhooks
→ signature verification

Audit
→ who changed what?

Least privilege
→ minimum IAM/scopes
```

For JWT:

```text
verify signature
issuer
audience
expiration
scopes/roles
```

Never trust client-supplied `user_id` or `tenant_id` over authenticated identity.

---

## 10. “How do you know your resume metric is true?”

You have several quantified claims:

```text
10,000+ concurrent
50% production bugs
60% manual QA
70% coverage
30% incidents
80% approval-cycle reduction
```

For **every one**, prepare this four-part answer:

```text
Baseline
→ what was measured before?

Intervention
→ what did we change?

Measurement
→ what system/report gave the number?

Window
→ over what period?
```

For example:

> “Coverage is straightforward: the test tooling reported repository coverage after the initiative. For business metrics such as defect reduction, I would identify the exact issue-tracking baseline and comparison period rather than implying the number was subjective.”

If you cannot reconstruct how one percentage was calculated, that is something to resolve **before the interview**, because an aggressive interviewer will detect an unsupported metric very quickly.

---

# The answer structure I recommend memorizing

For essentially every experience question, answer in this order:

```text
1. CONTEXT
What problem were we solving?

2. REQUIREMENTS / INVARIANTS
What absolutely had to be true?

3. ARCHITECTURE
What components did I choose?

4. FLOW
Walk one request/event end-to-end.

5. SCALE
What traffic/data/concurrency did it handle?

6. CONSISTENCY
What required strong vs eventual consistency?

7. FAILURE MODES
What if a dependency failed?

8. SECURITY
Authentication, authorization, secrets, isolation.

9. OBSERVABILITY
What metrics/traces/logs told us it worked?

10. CI/CD
How did code safely reach production?

11. TRADEOFF
What alternative did I reject and why?

12. OWNERSHIP
What specifically did I personally design/build?
```

If they ask something as simple as:

> “Tell me about the TicketSocket scaling work.”

you can compress that framework into a 2-minute answer:

```text
Problem
   ↓
Architecture
   ↓
Critical invariant
   ↓
Scale
   ↓
Failure handling
   ↓
My ownership
```

That is the pattern I would use throughout this interview.

The areas I would prioritize most heavily before the interview are **TicketSocket 350→10,000 scaling/JWT routing**, **TicketSocket PostgreSQL + transactional event processing**, **Gala's 10,000+ architecture**, **Gala Vision/vector/Sanity pipeline**, **Frequence's configurable Angular widget architecture**, **Playwright/Claude testing with the 50%/60% metrics**, and your **Agentic Engine DAG/evaluator architecture**. Those claims contain enough technical depth that a strong interviewer can remain on a single bullet for 15–30 minutes.
# Nephele

A pluggable WebDAV, CardDAV, and CalDAV server for Node.js and Express.

# Requirements

Java and JDK are required for XSD validation, so `java` and `javac` should be on the `$PATH` or `JAVA_HOME` should point to their location. When the client sends a request that includes an XML payload, the XML will be validated before a response is attempted. If you simply can't install Java and JDK, you can disable client payload validation in the config, but that may result in non-conformant behavior. Attempting to parse and respond to an invalid request is discouraged by the WebDAV spec (Appendix A).

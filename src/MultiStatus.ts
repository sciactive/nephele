import xml2js from 'xml2js';

import { HTTPStatusMessages } from './HTTPStatusMessages.js';

export class PropStatStatus {
  statusCode: number;
  statusMessage: string;
  body: { [k: string]: any } | undefined = undefined;
  props: { [k: string]: any } | undefined = undefined;
  description: string | undefined = undefined;

  constructor(statusCode: number, statusMessage?: string) {
    this.statusCode = statusCode;

    if (statusMessage) {
      this.statusMessage = statusMessage;
    } else if (statusCode in HTTPStatusMessages) {
      this.statusMessage =
        HTTPStatusMessages[statusCode as keyof typeof HTTPStatusMessages];
    } else {
      this.statusMessage = '';
    }
  }

  /**
   * Add an xml2js compatible body to the element.
   *
   * The object will be spread into the body of the element.
   *
   * Under normal circumstances, you shouldn't need to use this.
   *
   * @param body An xml2js compatible object.
   */
  setBody(body: { [k: string]: any } | undefined) {
    this.body = body;
  }

  /**
   * Add an xml2js compatible body to the props element.
   *
   * It should be a prop object, like this for successful props:
   *
   *     {
   *       someprop: ['value'],
   *       otherprop: ['other value']
   *     }
   *
   * Or like this for error props (like forbidden):
   *
   *     {
   *       someprop: {},
   *       otherprop: {}
   *     }
   *
   * @param props An xml2js compatible object.
   */
  setProps(props: { [k: string]: any } | undefined) {
    this.props = props;
  }

  render() {
    let response: { [k: string]: any } = {
      status: [`HTTP/1.1 ${this.statusCode} ${this.statusMessage}`],
    };

    if (this.description != null) {
      response.responsedescription = [this.description];
    }

    if (this.props) {
      response.props = this.props;
    }

    if (this.body) {
      response = { ...response, ...this.body };
    }

    return response;
  }
}

export class Status {
  element: string;
  statusCode: number;
  statusMessage: string;
  body: { [k: string]: any } | undefined = undefined;
  propStatStatuses: PropStatStatus[] = [];
  description: string | undefined = undefined;
  href: string;

  constructor(
    href: string,
    statusCode: number,
    statusMessage?: string,
    element: string = 'response'
  ) {
    this.href = href;
    this.statusCode = statusCode;
    this.element = element;

    if (statusMessage) {
      this.statusMessage = statusMessage;
    } else if (statusCode in HTTPStatusMessages) {
      this.statusMessage =
        HTTPStatusMessages[statusCode as keyof typeof HTTPStatusMessages];
    } else {
      this.statusMessage = '';
    }
  }

  setDescription(description: string | undefined) {
    this.description = description;
  }

  /**
   * Add an xml2js compatible body to the element.
   *
   * The object will be spread into the body of the element.
   *
   * @param body An xml2js compatible object.
   */
  setBody(body: { [k: string]: any } | undefined) {
    // TODO: Should I use these checks?
    // if (this.propStatStatuses.length) {
    //   throw new Error("Can't add body to a Status with PropStatStatuses.");
    // }

    this.body = body;
  }

  addPropStatStatus(propStatStatus: PropStatStatus) {
    // if (this.body != null) {
    //   throw new Error("Can't add PropStatStatus to a Status with a body.");
    // }

    this.propStatStatuses.push(propStatStatus);
  }

  render() {
    let response: { [k: string]: any } = { href: [this.href] };

    if (this.description != null) {
      response.responsedescription = [this.description];
    }

    if (this.propStatStatuses.length > 0) {
      // propstat includes the response codes within the propstat object.
      response.propstat = [];

      for (let propStatStatus of this.propStatStatuses) {
        response.propstat.push(propStatStatus.render());
      }
    } else {
      // Build a response object.
      response.status = [`HTTP/1.1 ${this.statusCode} ${this.statusMessage}`];
    }

    if (this.body) {
      response = { ...response, ...this.body };
    }

    return response;
  }
}

export class MultiStatus {
  builder: xml2js.Builder;
  statuses: Status[] = [];
  description: string | undefined = undefined;

  constructor() {
    this.builder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8' },
    });
  }

  addStatus(status: Status) {
    this.statuses.push(status);
  }

  setDescription(description: string | undefined) {
    this.description = description;
  }

  render() {
    const responses: any[] = [];
    const xml: any = {
      multistatus: {
        $: {
          xmlns: 'DAV:',
        },
      },
    };

    if (this.description != null) {
      xml.responsedescription = [this.description];
    }

    if (this.statuses.length < 1) {
      return this.builder.buildObject(xml);
    }

    xml.multistatus.response = responses;

    for (let status of this.statuses) {
      responses.push(status.render());
    }

    // console.log(JSON.stringify(xml, null, 2));
    return this.builder.buildObject(xml);
  }
}

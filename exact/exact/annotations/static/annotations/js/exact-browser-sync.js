

class EXACTBrowserSync {

    constructor() {
        //this.viewer = viewer;
        //this.channelName = channelName;

        //this.channel = new BroadcastChannel(channelName);
        //this.channel.onmessage = this.messageEvent.bind(this)
        this.channels = {}
    }

    getChannelObject(channelName) {

        let channel = null;
        if (channelName in this.channels) {
            channel = this.channels[channelName];
        } else {
            this.channels[channelName] = this._createNewChannel(channelName);
            channel = this.channels[channelName];
        }

        return channel;
    }

    _createNewChannel(channelName) {

        return new BroadcastChannel(channelName);

    }

    onNewChannelMessage(messageEvent) {

    }

    postMessage(message) {
        this.channel.postMessage(message);
    }


    destroy() {
        this.channel.close();
    }


}
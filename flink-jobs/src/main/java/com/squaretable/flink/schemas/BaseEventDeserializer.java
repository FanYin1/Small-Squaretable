package com.squaretable.flink.schemas;

import com.google.gson.Gson;
import org.apache.flink.api.common.serialization.DeserializationSchema;
import org.apache.flink.api.common.typeinfo.TypeInformation;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class BaseEventDeserializer implements DeserializationSchema<BaseEvent> {
    private static final Gson gson = new Gson();

    @Override
    public BaseEvent deserialize(byte[] message) throws IOException {
        String json = new String(message, StandardCharsets.UTF_8);
        return gson.fromJson(json, BaseEvent.class);
    }

    @Override
    public boolean isEndOfStream(BaseEvent nextElement) {
        return false;
    }

    @Override
    public TypeInformation<BaseEvent> getProducedType() {
        return TypeInformation.of(BaseEvent.class);
    }
}

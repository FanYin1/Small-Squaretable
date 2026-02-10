package com.squaretable.flink.functions;

import com.squaretable.flink.schemas.BaseEvent;
import org.apache.flink.api.common.functions.MapFunction;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * MapFunction that strips PII (Personally Identifiable Information) from BaseEvent
 * properties and context maps. Applied as the first operator in all Flink jobs.
 *
 * <p>Behavior:
 * <ul>
 *   <li>Email fields and values matching email patterns are replaced with SHA-256 hashes</li>
 *   <li>Content, IP, and phone fields are removed (set to null)</li>
 *   <li>IP addresses in the context map are also removed</li>
 *   <li>Non-PII fields are preserved unchanged</li>
 *   <li>The original event is not mutated; a new copy is returned</li>
 * </ul>
 */
public class PiiFilter implements MapFunction<BaseEvent, BaseEvent> {

    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$"
    );

    /** Property keys whose values should be completely removed (nullified). */
    private static final Set<String> NULLIFY_KEYS = Set.of(
            "content", "ip", "ipAddress", "phone", "phoneNumber"
    );

    /** Context keys whose values should be removed. */
    private static final Set<String> CONTEXT_REMOVE_KEYS = Set.of(
            "ip", "ipAddress"
    );

    /** Property keys that are known email fields and should always be hashed. */
    private static final Set<String> EMAIL_KEYS = Set.of("email");

    @Override
    public BaseEvent map(BaseEvent event) throws Exception {
        BaseEvent filtered = copyEvent(event);
        filtered.setProperties(filterProperties(event.getProperties()));
        filtered.setContext(filterContext(event.getContext()));
        return filtered;
    }

    /**
     * Filters the properties map: nullifies PII keys, hashes email fields and
     * any value matching an email pattern.
     */
    private Map<String, Object> filterProperties(Map<String, Object> properties) {
        if (properties == null) {
            return null;
        }
        Map<String, Object> filtered = new HashMap<>();
        for (Map.Entry<String, Object> entry : properties.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();

            if (NULLIFY_KEYS.contains(key)) {
                // Remove PII fields by not including them
                continue;
            }

            if (EMAIL_KEYS.contains(key) && value != null) {
                filtered.put(key, sha256(value.toString()));
            } else if (value != null && EMAIL_PATTERN.matcher(value.toString()).matches()) {
                filtered.put(key, sha256(value.toString()));
            } else {
                filtered.put(key, value);
            }
        }
        return filtered;
    }

    /**
     * Filters the context map: removes IP address fields.
     */
    private Map<String, Object> filterContext(Map<String, Object> context) {
        if (context == null) {
            return null;
        }
        Map<String, Object> filtered = new HashMap<>();
        for (Map.Entry<String, Object> entry : context.entrySet()) {
            if (!CONTEXT_REMOVE_KEYS.contains(entry.getKey())) {
                filtered.put(entry.getKey(), entry.getValue());
            }
        }
        return filtered;
    }

    /**
     * Creates a shallow copy of the event without mutating the original.
     */
    private BaseEvent copyEvent(BaseEvent original) {
        BaseEvent copy = new BaseEvent();
        copy.setEventId(original.getEventId());
        copy.setEventType(original.getEventType());
        copy.setUserId(original.getUserId());
        copy.setTenantId(original.getTenantId());
        copy.setSessionId(original.getSessionId());
        copy.setTimestamp(original.getTimestamp());
        return copy;
    }

    /**
     * Computes the SHA-256 hex digest of the given input string.
     */
    static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
